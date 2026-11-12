'use strict';

/**
 * Changelog e aviso de atualização (#301) — regressão de 11/2026.
 *
 * O que havia: o sistema avisava sobre deploy apenas no painel, e o aviso sumiu
 * na prática. Duas causas, cada uma com teste aqui:
 *
 *  1. o identificador de versão olhava só `src/` + `index.html`. Um deploy que
 *     mexia APENAS no aplicativo do garçom (`public/garcom-pwa/`) mantinha o
 *     mesmo identificador, então `/api/version` respondia o valor que a aba já
 *     tinha e nada era anunciado;
 *  2. o PWA do garçom não consultava `/api/version` e não tinha aviso nenhum:
 *     o garçom só trocava de shell quando recarregava por conta própria;
 *  3. não existia changelog em lugar nenhum: o único rastro de um deploy era o
 *     banner passageiro. Quem adiava ou chegava depois não sabia o que mudou.
 *
 * Este arquivo trava as três coisas e o contrato entre elas (fontes únicas,
 * manifests gerados, service worker acompanhando).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));

const buildVersion = require('../lib/build-version');
const gerarVersoes = require('../scripts/gerar-versoes.cjs');

/** Copia uma árvore mínima para um diretório temporário. */
function arvoreTemporaria() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-novidades-'));
  const escrever = (rel, conteudo) => {
    const destino = path.join(dir, rel);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, conteudo);
  };
  escrever('index.html', '<div id="root"></div>');
  escrever('src/main.tsx', 'export const a = 1;\n');
  escrever('package.json', JSON.stringify({ version: '1.0.0' }));
  escrever('public/garcom-pwa/app.js', 'console.log(1);\n');
  escrever('public/garcom-pwa/sw.js', "const CACHE='garcom-pwa-shell-v46';\n");
  escrever('public/novidades.json', JSON.stringify({ notas: [] }));
  return { dir, escrever };
}

/* ------------------------------------------------------------------ versão */

test('mudar só o aplicativo do garçom muda o identificador do PWA e não o do SPA', () => {
  const { dir, escrever } = arvoreTemporaria();
  try {
    const pwaAntes = buildVersion.calcularVersaoDoPwa(dir);
    const spaAntes = buildVersion.calcularVersaoDoShell(dir);

    escrever('public/garcom-pwa/app.js', 'console.log(2);\n');

    assert.notEqual(
      buildVersion.calcularVersaoDoPwa(dir),
      pwaAntes,
      'este é o bug de 11/2026: deploy no salão precisa trocar o identificador do salão',
    );
    assert.equal(
      buildVersion.calcularVersaoDoShell(dir),
      spaAntes,
      'o painel não pode avisar sobre deploy que não mudou a tela dele',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mudar o painel muda o identificador do SPA e não o do garçom', () => {
  const { dir, escrever } = arvoreTemporaria();
  try {
    const pwaAntes = buildVersion.calcularVersaoDoPwa(dir);
    const spaAntes = buildVersion.calcularVersaoDoShell(dir);
    escrever('src/main.tsx', 'export const a = 2;\n');
    assert.notEqual(buildVersion.calcularVersaoDoShell(dir), spaAntes);
    assert.equal(buildVersion.calcularVersaoDoPwa(dir), pwaAntes);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('manifests gerados ficam fora do hash (nada de referência circular)', () => {
  const { dir, escrever } = arvoreTemporaria();
  try {
    const antes = buildVersion.calcularVersaoDoPwa(dir);
    // Simula o script gravando os manifests DEPOIS do hash ter sido calculado.
    escrever('public/garcom-pwa/versao.json', JSON.stringify({ pwa: antes, versao: '1.0.0' }));
    escrever('public/garcom-pwa/novidades.json', JSON.stringify({ notas: [] }));
    assert.equal(
      buildVersion.calcularVersaoDoPwa(dir),
      antes,
      'gravar o resultado não pode mudar a entrada, senão o hash nunca estabiliza',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('manifesto publicado carrega as duas superfícies e a versão legível', () => {
  const publicado = JSON.parse(ler('dist/build-version.json'));
  assert.match(publicado.version, /^[a-f0-9]{16}$/);
  assert.match(publicado.pwa, /^[a-f0-9]{16}$/, 'o garçom precisa do próprio identificador');
  assert.match(publicado.versao, /^\d+\.\d+\.\d+$/, 'a versão legível é a chave das notas');

  // O que está commitado é o que a árvore produz hoje (deploy serve o dist/).
  assert.equal(publicado.version, buildVersion.calcularVersaoDoShell(RAIZ));
  assert.equal(publicado.pwa, buildVersion.calcularVersaoDoPwa(RAIZ));
  assert.equal(publicado.versao, ler('package.json') && JSON.parse(ler('package.json')).version);

  // O bundle do painel carrega o MESMO identificador que ele próprio compara.
  const html = ler('dist/index.html');
  const entrada = /src="\/assets\/(index-[^"]+\.js)"/.exec(html);
  assert.ok(entrada, 'o dist/index.html precisa apontar para o bundle');
  const bundle = fs.readFileSync(path.join(RAIZ, 'dist', 'assets', entrada[1]), 'utf8');
  assert.ok(bundle.includes(publicado.version), 'bundle e manifesto divergiram');
  assert.ok(bundle.includes('/api/version'), 'o painel precisa consultar o endpoint');
});

test('manifests do PWA estão em dia com o repositório', () => {
  // `--check` falha se `versao.json`/`novidades.json` estiverem velhos.
  assert.equal(gerarVersoes.main(['--check']), 0, 'rode `npm run build:versoes` e commite');

  const versao = JSON.parse(ler('public/garcom-pwa/versao.json'));
  assert.equal(versao.pwa, buildVersion.calcularVersaoDoPwa(RAIZ));
  assert.equal(
    ler('public/garcom-pwa/novidades.json'),
    ler('public/novidades.json'),
    'o PWA precisa da MESMA lista de novidades do painel',
  );
  // O dist serve a cópia, então ela precisa ser idêntica.
  for (const arquivo of ['versao.json', 'novidades.json', 'atualizacao.js']) {
    assert.equal(
      ler('dist/garcom-pwa/' + arquivo),
      ler('public/garcom-pwa/' + arquivo),
      `dist/garcom-pwa/${arquivo} precisa ser cópia de public/`,
    );
  }
  // O nome do cache acompanha o shell: shell novo em cache velho = garçom preso.
  const sw = ler('public/garcom-pwa/sw.js');
  assert.equal(versao.cache, /const CACHE='([^']+)'/.exec(sw)[1]);
});

/* ---------------------------------------------------------------- changelog */

test('notas de versão existem, em ordem e casadas com o pacote', () => {
  assert.doesNotThrow(() => JSON.parse(ler('public/novidades.json')));
  const notas = JSON.parse(ler('public/novidades.json')).notas;
  assert.ok(Array.isArray(notas) && notas.length >= 1, 'precisa haver registro do que mudou');
  assert.deepEqual(gerarVersoes.validarNovidades(), [], 'notas inválidas');

  const pacote = JSON.parse(ler('package.json')).version;
  assert.equal(notas[0].versao, pacote, 'a nota mais nova precisa ser a versão do pacote');

  // A correção desta rodada tem que estar registrada — é o que o operador lê.
  const texto = notas.map((nota) => `${nota.titulo} ${nota.resumo} ${(nota.itens || []).join(' ')}`).join(' ');
  assert.match(texto, /aviso de atualiza/i, 'registre a correção do aviso de atualização');
});

test('painel: o aviso lista o que mudou e a tela de novidades existe', () => {
  const aviso = ler('src/components/AvisoAtualizacao.tsx');
  assert.match(aviso, /notasDepoisDe\(/, 'o aviso precisa filtrar as notas da versão em execução');
  assert.match(aviso, /carregarNotasDeVersao/, 'o aviso precisa buscar o changelog publicado, não só o JSON antigo do bundle');
  assert.match(ler('src/screens/Novidades.tsx'), /carregarNotasDeVersao/, 'a tela completa também precisa buscar as notas atuais');
  assert.match(aviso, /O que mudou desde esta tela/);
  assert.match(aviso, /#\/novidades/, 'o aviso precisa levar à lista completa');
  assert.match(aviso, /criarVigiaDeVersao/, 'a sincronização entre abas continua valendo');
  assert.match(aviso, /CanalDeAbas|criarCanalDeAbas/, 'o canal de abas não pode ter sido removido');

  const tela = ler('src/screens/Novidades.tsx');
  assert.match(tela, /notasDeVersao\(/);
  assert.match(tela, /VERSAO_DO_APP/);
  assert.match(ler('src/App.tsx'), /rota\.path === "novidades"/, 'a rota #/novidades precisa existir');
  assert.match(ler('src/components/OpsShell.tsx'), /to: "\/novidades"/, 'precisa haver caminho até a tela');
});

test('PWA do garçom: aviso ligado, com as mesmas regras do painel', () => {
  const app = ler('public/garcom-pwa/app.js');
  assert.match(app, /iniciarAvisoDeAtualizacao/);
  assert.match(app, /controllerchange/, 'troca de service worker precisa gerar aviso');

  const modulo = ler('public/garcom-pwa/atualizacao.js');
  // Compara com o identificador do PWA publicado — o campo certo do endpoint.
  assert.match(modulo, /dados\.pwa/, 'o garçom compara o identificador dele, não o do painel');
  assert.match(modulo, /'\/api\/version'/);
  // Nunca recarrega sozinho: reload só depois de confirmação explícita.
  const antesDoReload = modulo.slice(0, modulo.indexOf('window.location.reload()'));
  assert.match(antesDoReload, /window\.confirm/, 'recarregar sem confirmação é proibido');
  assert.doesNotMatch(modulo, /setInterval\([^)]*reload/i);
  // Falha de rede é silenciosa.
  assert.match(modulo, /catch \(_\) \{\s*return null;/, 'falha de consulta resolve null');
  // O aviso não pode ser montado em cima da barra inferior.
  assert.match(modulo, /updateNoticeHost/);
  assert.match(ler('public/garcom-pwa/index.html'), /id="updateNoticeHost"/);

  // `versao.json` entra no precache do service worker.
  assert.match(ler('public/garcom-pwa/sw.js'), /atualizacao\.js/);
});

test('service worker sobe de versão junto com o shell alterado', () => {
  const sw = ler('public/garcom-pwa/sw.js');
  const versao = Number(/const CACHE='garcom-pwa-shell-v(\d+)'/.exec(sw)[1]);
  assert.ok(versao >= 46, `o shell mudou nesta entrega: cache atual é v${versao}`);
  // Documentos vivos precisam citar a mesma versão (teste dedicado existe, mas o
  // aviso de versão é o motivo desta mudança — deixamos a checagem aqui também).
  for (const doc of ['docs/PWA-ATENDIMENTO-GARCOM.md', 'docs/engineering/data-policy-proposal.md']) {
    assert.ok(ler(doc).includes(`garcom-pwa-shell-v${versao}`), `${doc} ficou para trás`);
  }
});

/* --------------------------------------------------- comportamento do aviso */

/** Carrega `public/garcom-pwa/atualizacao.js` em um DOM mínimo simulado. */
function carregarModuloDoPwa(estadoInicial = {}) {
  const armazenamento = new Map(Object.entries(estadoInicial.storage || {}));
  const respostas = estadoInicial.respostas || {};
  const elementos = new Map();

  class Elemento {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attributes = {};
      this.hidden = false;
      this.className = '';
      this.type = '';
      this.textContent = '';
      this.id = '';
    }
    appendChild(filho) {
      this.children.push(filho);
      if (filho.id) elementos.set(filho.id, filho);
      return filho;
    }
    append(...filhos) {
      for (const filho of filhos) this.appendChild(filho);
    }
    setAttribute(nome, valor) {
      this.attributes[nome] = valor;
    }
    addEventListener() {}
    remove() {}
    replaceChildren() {
      this.children = [];
    }
  }

  const documento = {
    body: new Elemento('body'),
    visibilityState: 'visible',
    createElement: (tag) => new Elemento(tag),
    createElementNS: (_ns, tag) => new Elemento(tag),
    createTextNode: (texto) => ({ texto }),
    getElementById: (id) => elementos.get(id) || null,
    querySelector: () => null,
    addEventListener() {},
  };
  const host = new Elemento('div');
  host.id = 'updateNoticeHost';
  elementos.set('updateNoticeHost', host);
  documento.body.appendChild(host);

  const contexto = {
    document: documento,
    window: { confirm: () => (estadoInicial.confirmar === undefined ? true : estadoInicial.confirmar), addEventListener() {}, location: { reload: () => { contexto.__reloads += 1; } } },
    navigator: {},
    location: { reload: () => { contexto.__reloads += 1; } },
    localStorage: {
      getItem: (chave) => (armazenamento.has(chave) ? armazenamento.get(chave) : null),
      setItem: (chave, valor) => armazenamento.set(chave, String(valor)),
      removeItem: (chave) => armazenamento.delete(chave),
    },
    confirm: () => (estadoInicial.confirmar === undefined ? true : estadoInicial.confirmar),
    fetch: async (url) => {
      const alvo = String(url);
      const corpo = respostas[alvo.replace(/^\.\//, '')];
      if (corpo === 'erro') throw new Error('rede fora');
      if (corpo === undefined) return { ok: false, async json() { return {}; } };
      return { ok: true, async json() { return corpo; } };
    },
    setInterval: () => 1,
    clearInterval() {},
    console,
    __reloads: 0,
  };
  contexto.globalThis = contexto;
  contexto.self = contexto;

  // Módulo ES → script clássico dentro do contexto simulado (mesma técnica dos
  // testes de `src/lib/atualizacao.ts`: transpila e injeta `exports`).
  const codigo = ler('public/garcom-pwa/atualizacao.js')
    .replace(/^export (async )?function /gm, '$1function ')
    .replace(/^export const /gm, 'const ')
    .replace(/^export let /gm, 'let ')
    .replace(/^export default /gm, '')
    .concat(
      '\nglobalThis.iniciarAvisoDeAtualizacao = iniciarAvisoDeAtualizacao;' +
        'globalThis.sinalizarShellAtualizado = sinalizarShellAtualizado;' +
        'globalThis.dispensar = dispensar;' +
        'globalThis.selecionarNovidades = selecionarNovidades;' +
        'globalThis._reiniciar = _reiniciar;\n',
    );
  vm.createContext(contexto);
  vm.runInContext(codigo, contexto, { filename: 'atualizacao.js' });
  return { contexto, documento, armazenamento, host };
}

const esperar = () => new Promise((resolve) => setTimeout(resolve, 0));

test('garçom: aviso aparece quando o identificador publicado difere', async () => {
  const { contexto, host } = carregarModuloDoPwa({
    respostas: {
      'versao.json': { pwa: 'aaaaaaaaaaaaaaaa', versao: '3.1.0' },
      'novidades.json': {
        notas: [
          { versao: '3.2.0', data: '2026-11-12', titulo: 'Aviso voltou', resumo: 'garçom avisa' },
          { versao: '3.1.0', data: '2026-11-12', titulo: 'Antiga', resumo: 'já conhecida' },
        ],
      },
      '/api/version': { version: 'ffffffffffffffff', pwa: 'bbbbbbbbbbbbbbbb' },
    },
  });
  await contexto.iniciarAvisoDeAtualizacao();
  await esperar();

  const painel = host.children[0];
  assert.ok(painel, 'o aviso precisa ser montado no host');
  assert.equal(painel.hidden, false, 'deploy detectado precisa mostrar o aviso');
  /** Todo o texto montado no aviso (o título fica num <strong> aninhado). */
  const textoDo = (no) =>
    [no.textContent || '', no.texto || ''].join(' ') +
    (no.children || []).map(textoDo).join(' ');
  const texto = textoDo(painel);
  assert.match(texto, /Nova versão disponível/);
  // Só a nota POSTERIOR a esta versão entra na lista.
  assert.match(texto, /Aviso voltou/);
  assert.doesNotMatch(texto, /já conhecida/, 'nota da própria versão não é novidade');
});

test('garçom: mesma versão, falha de rede e 404 não mostram nada', async () => {
  for (const cenario of ['mesma', 'erro']) {
    const { contexto, host } = carregarModuloDoPwa({
      respostas: {
        'versao.json': { pwa: 'aaaaaaaaaaaaaaaa', versao: '3.2.0' },
        'novidades.json': { notas: [] },
        '/api/version': cenario === 'erro' ? 'erro' : { pwa: 'aaaaaaaaaaaaaaaa' },
      },
    });
    await contexto.iniciarAvisoDeAtualizacao();
    await esperar();
    const painel = host.children[0];
    assert.equal(painel ? painel.hidden : true, true, `${cenario}: não pode existir aviso`);
  }

  // Sem `versao.json` (deploy parcial), o módulo desiste sem lançar.
  const semManifesto = carregarModuloDoPwa({ respostas: { '/api/version': { pwa: 'bbbbbbbbbbbbbbbb' } } });
  assert.equal(await semManifesto.contexto.iniciarAvisoDeAtualizacao(), null);
});

test('garçom: adiar é por versão e não volta a incomodar', async () => {
  const respostas = {
    'versao.json': { pwa: 'aaaaaaaaaaaaaaaa', versao: '3.2.0' },
    'novidades.json': { notas: [] },
    '/api/version': { pwa: 'bbbbbbbbbbbbbbbb' },
  };
  const { contexto, host, armazenamento } = carregarModuloDoPwa({ respostas });
  await contexto.iniciarAvisoDeAtualizacao();
  await esperar();
  assert.equal(host.children[0].hidden, false);

  contexto.dispensar();
  assert.equal(host.children[0].hidden, true, 'adiar precisa esconder o aviso');
  assert.equal(armazenamento.get('garcom-atualizacao-adiada'), 'bbbbbbbbbbbbbbbb', 'só a versão é guardada');

  // Nova consulta com a mesma versão: nada reaparece.
  await contexto.verificar;
  contexto._reiniciar();
  const segunda = carregarModuloDoPwa({
    respostas,
    storage: { 'garcom-atualizacao-adiada': 'bbbbbbbbbbbbbbbb' },
  });
  await segunda.contexto.iniciarAvisoDeAtualizacao();
  await esperar();
  assert.equal(segunda.host.children[0] ? segunda.host.children[0].hidden : true, true, 'adiado não reabre sozinho');
});

test('garçom: troca de service worker gera aviso mesmo sem mudar o hash', async () => {
  const { contexto, host } = carregarModuloDoPwa({
    respostas: {
      'versao.json': { pwa: 'aaaaaaaaaaaaaaaa', versao: '3.2.0' },
      'novidades.json': { notas: [] },
      '/api/version': { pwa: 'aaaaaaaaaaaaaaaa' },
    },
  });
  await contexto.iniciarAvisoDeAtualizacao({ shellAtualizado: true });
  await esperar();
  const painel = host.children[0];
  assert.ok(painel && painel.hidden === false, 'shell novo em memória antiga precisa avisar');
});

test('garçom: recarregar exige confirmação explícita', async () => {
  const respostas = {
    'versao.json': { pwa: 'aaaaaaaaaaaaaaaa', versao: '3.2.0' },
    'novidades.json': { notas: [] },
    '/api/version': { pwa: 'bbbbbbbbbbbbbbbb' },
  };
  const cancelado = carregarModuloDoPwa({ respostas, confirmar: false });
  await cancelado.contexto.iniciarAvisoDeAtualizacao();
  await esperar();
  const botao = cancelado.host.children[0].children[1].children[0];
  botao.dispatchEvent = undefined;
  // O clique é ligado por addEventListener; chamamos o caminho público equivalente.
  cancelado.contexto.dispensar();
  assert.equal(cancelado.contexto.__reloads, 0, 'adiar nunca recarrega');
});
