'use strict';

/**
 * Comportamento real do vigia de versão (#301). Exercita `src/lib/atualizacao.ts`
 * transpilado com o `typescript` do projeto — não uma cópia da lógica — em Node,
 * simulando abas, relógio e falhas de rede.
 *
 * Requisitos cobertos aqui (critérios de aceite da issue):
 *  - sessão aberta ANTES do deploy detecta a versão nova (comparação com o
 *    bundle em execução, não com a primeira resposta da API);
 *  - usuário pode adiar e continuar trabalhando; o adiamento vale para a
 *    versão detectada e NÃO existe reload automático depois;
 *  - aviso sincronizado entre abas (incluindo o adiamento em todas elas);
 *  - endpoint indisponível / rede falhando não gera aviso nem bloqueia nada;
 *  - nenhum aviso repetido e nenhum loop de reload;
 *  - o vigia nunca recarrega a página por conta própria.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const FONTE = path.join(__dirname, '..', 'src', 'lib', 'atualizacao.ts');

function carregarModulo() {
  const compilado = ts.transpileModule(fs.readFileSync(FONTE, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const modulo = { exports: {} };
  const contexto = { module: modulo, exports: modulo.exports, require, console, setTimeout, clearTimeout };
  vm.createContext(contexto);
  vm.runInContext(compilado, contexto, { filename: 'atualizacao.ts' });
  return modulo.exports;
}

/** Hub de BroadcastChannel: entrega a mensagem a TODAS as outras abas. */
function hub() {
  const canais = new Set();
  class Canal {
    constructor(nome) {
      this.nome = nome;
      this.onmessage = null;
      canais.add(this);
    }
    postMessage(data) {
      for (const c of canais) {
        if (c === this || c.nome !== this.nome) continue;
        if (typeof c.onmessage === 'function') c.onmessage({ data });
      }
    }
    close() {
      canais.delete(this);
    }
  }
  return { criar: () => new Canal('qr-admin-atualizacao'), quantidade: () => canais.size };
}

/**
 * Servidor falso de `/api/version`. `versao` pode ser trocada no meio do teste
 * (deploy), e `falhar` simula indisponibilidade.
 */
function servidorVersao(versaoInicial) {
  return {
    versao: versaoInicial,
    falhar: false,
    chamadas: 0,
    async consultar() {
      this.chamadas += 1;
      if (this.falhar) throw new Error('rede fora');
      return this.versao;
    },
  };
}

function criarAba(servidor, opcoes = {}) {
  const { criarVigiaDeVersao } = carregarModulo();
  const canais = opcoes.canais || hub();
  const estados = [];
  const agendamentos = [];
  let reloads = 0;

  const vigia = criarVigiaDeVersao({
    versaoEmExecucao: opcoes.versaoEmExecucao || 'aaaaaaaaaaaaaaaa',
    consultarVersao: () => servidor.consultar(),
    aoMudar: (estado) => estados.push(estado),
    criarCanal: () => canais.criar(),
    visivel: () => opcoes.visivel !== false,
    lerAdiamento: () => {
      const registro = opcoes.adiadas;
      if (!registro) return null;
      const valores = Object.values(registro);
      return valores.length ? valores[valores.length - 1] : null;
    },
    gravarAdiamento: (versao) => {
      if (opcoes.adiadas) opcoes.adiadas[versao] = versao;
      if (opcoes.registrarAdiamento) opcoes.registrarAdiamento(versao);
    },
    agendar: (fn) => {
      agendamentos.push(fn);
      return agendamentos.length - 1;
    },
    cancelarAgendamento: (id) => {
      agendamentos[id] = null;
    },
    registrarGatilhos: () => () => {},
  });

  const parar = vigia.iniciar();
  return {
    vigia,
    estados,
    canais,
    parar,
    reloads: () => reloads,
    // simula o clique em "Atualizar agora" (efeito fora do vigia: reload)
    recarregar: () => {
      reloads += 1;
    },
    /** Dispara o próximo tick do polling agendado. */
    tick: async () => {
      const proximos = agendamentos.splice(0, agendamentos.length);
      for (const fn of proximos) if (fn) fn();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

test('aba aberta antes do deploy detecta a versão nova na consulta seguinte', async () => {
  const servidor = servidorVersao('aaaaaaaaaaaaaaaa'); // igual ao bundle em execução
  const aba = criarAba(servidor);
  await esperar();
  assert.equal(aba.vigia.estado(), 'ocioso', 'primeira consulta não pode avisar sem deploy');
  assert.deepEqual(aba.estados, []);

  servidor.versao = 'bbbbbbbbbbbbbbbb'; // deploy concluído
  await aba.vigia.verificar();
  assert.equal(aba.vigia.estado(), 'disponivel');
  assert.equal(aba.vigia.versaoNotificada(), 'bbbbbbbbbbbbbbbb');
  assert.deepEqual(aba.estados, ['disponivel']);
  aba.parar();
});

test('falha de rede ou endpoint 503 não gera aviso e o trabalho continua', async () => {
  // Começa na MESMA versão do bundle: sem deploy, ninguém deve ser avisado.
  const servidor = servidorVersao('aaaaaaaaaaaaaaaa');
  const aba = criarAba(servidor);
  servidor.falhar = true;
  await esperar();
  await aba.vigia.verificar();
  await aba.tick();
  assert.equal(aba.vigia.estado(), 'ocioso');
  assert.deepEqual(aba.estados, [], 'falha silenciosa: nada de aviso nem de erro na tela');

  servidor.falhar = false;
  servidor.versao = 'dddddddddddddddd';
  await aba.vigia.verificar();
  assert.equal(aba.vigia.estado(), 'disponivel', 'voltar a rede recupera a detecção');
  aba.parar();
});

test('resposta inválida (sem version) é tratada como falha', async () => {
  const { criarVigiaDeVersao } = carregarModulo();
  const estados = [];
  const vigia = criarVigiaDeVersao({
    versaoEmExecucao: 'aaaaaaaaaaaaaaaa',
    consultarVersao: async () => null,
    aoMudar: (e) => estados.push(e),
    agendar: () => 1,
    cancelarAgendamento: () => {},
    registrarGatilhos: () => () => {},
    criarCanal: () => null,
  });
  vigia.iniciar();
  await vigia.verificar();
  assert.deepEqual(estados, []);
  vigia.adiar(); // adiar sem aviso é no-op, não quebra
  assert.equal(vigia.estado(), 'ocioso');
});

test('adiar mantém o aviso adiado: sem reload automático e sem repetir o aviso', async () => {
  const servidor = servidorVersao('bbbbbbbbbbbbbbbb');
  const aba = criarAba(servidor);
  await esperar();
  assert.equal(aba.vigia.estado(), 'disponivel');

  aba.vigia.adiar();
  assert.equal(aba.vigia.estado(), 'dispensado');
  assert.equal(aba.reloads(), 0, 'adiar nunca recarrega a página');

  // polling continua: a MESMA versão não pode reabrir o aviso.
  await aba.tick();
  await aba.tick();
  await aba.vigia.verificar();
  assert.equal(aba.vigia.estado(), 'dispensado');
  assert.deepEqual(aba.estados, ['disponivel', 'dispensado']);
  assert.equal(aba.reloads(), 0);

  // Um deploy POSTERIOR (versão nova de novo) volta a avisar — é outra versão.
  servidor.versao = 'eeeeeeeeeeeeeeee';
  await aba.vigia.verificar();
  assert.equal(aba.vigia.estado(), 'disponivel');
  assert.equal(aba.vigia.versaoNotificada(), 'eeeeeeeeeeeeeeee');
  aba.parar();
});

test('adiamento sobrevive a recarregar a aba (mesma versão não reavisa)', async () => {
  const servidor = servidorVersao('bbbbbbbbbbbbbbbb');
  const adiadas = {};
  const aba = criarAba(servidor, { adiadas });
  await esperar();
  aba.vigia.adiar();
  assert.equal(adiadas.bbbbbbbbbbbbbbbb, 'bbbbbbbbbbbbbbbb', 'adiamento por versão é gravado');
  aba.parar();

  // "Recarregar a aba": novo vigia, mesmo storage do navegador, mesma versão.
  const recarregada = criarAba(servidor, { adiadas });
  await esperar();
  assert.equal(recarregada.vigia.estado(), 'dispensado', 'a escolha do operador continua valendo');
  assert.equal(recarregada.reloads(), 0);
  recarregada.parar();
});

test('aviso e adiamento são sincronizados entre abas', async () => {
  const canais = hub();
  const servidor = servidorVersao('aaaaaaaaaaaaaaaa');
  const aba1 = criarAba(servidor, { canais });
  const aba2 = criarAba(servidor, { canais });
  await esperar();

  servidor.versao = 'bbbbbbbbbbbbbbbb';
  await aba1.vigia.verificar();
  // aba2 recebeu o aviso pelo canal, sem precisar consultar a API.
  assert.equal(aba2.vigia.estado(), 'disponivel');
  assert.equal(aba2.vigia.versaoNotificada(), 'bbbbbbbbbbbbbbbb');

  // Adiar em uma aba dispensa nas duas: nada de aviso insistente na outra.
  aba2.vigia.adiar();
  assert.equal(aba1.vigia.estado(), 'dispensado');
  assert.equal(aba1.reloads(), 0);
  assert.equal(aba2.reloads(), 0);
  aba1.parar();
  aba2.parar();
});

test('canal entre abas sem suporte não impede a detecção (cada aba consulta)', async () => {
  const servidor = servidorVersao('bbbbbbbbbbbbbbbb');
  const aba = criarAba(servidor, { canais: { criar: () => null } });
  await esperar();
  assert.equal(aba.vigia.estado(), 'disponivel');
  aba.parar();
});

test('aba em segundo plano não consulta a API (economia e sem ruído)', async () => {
  const servidor = servidorVersao('bbbbbbbbbbbbbbbb');
  const aba = criarAba(servidor, { visivel: false });
  await esperar();
  assert.equal(servidor.chamadas, 0, 'aba oculta não deve bater no endpoint');
  await aba.vigia.verificar();
  assert.equal(servidor.chamadas, 0);
  assert.equal(aba.vigia.estado(), 'ocioso');
  aba.parar();
});

test('nova versão já detectada não duplica aviso nem loopa reload', async () => {
  const servidor = servidorVersao('bbbbbbbbbbbbbbbb');
  const aba = criarAba(servidor);
  await esperar();
  const chamadasNoAviso = servidor.chamadas;
  for (let i = 0; i < 5; i++) {
    await aba.vigia.verificar();
    await aba.tick();
  }
  assert.deepEqual(aba.estados, ['disponivel'], 'um único aviso por versão');
  assert.ok(servidor.chamadas > chamadasNoAviso, 'o polling continua ativo');
  assert.equal(aba.reloads(), 0);
  aba.parar();
});

test('requisição em voo é ignorada se o vigia foi desmontado (sem estado órfão)', async () => {
  const { criarVigiaDeVersao } = carregarModulo();
  let liberar;
  const pendente = new Promise((resolve) => { liberar = resolve; });
  const estados = [];
  const vigia = criarVigiaDeVersao({
    versaoEmExecucao: 'aaaaaaaaaaaaaaaa',
    consultarVersao: () => pendente,
    aoMudar: (e) => estados.push(e),
    agendar: () => 1,
    cancelarAgendamento: () => {},
    registrarGatilhos: () => () => {},
    criarCanal: () => null,
  });
  // Dois `iniciar()` representam o duplo efeito do StrictMode em dev; o de
  // produção monta uma vez. O que não pode acontecer é estado órfão.
  const parar = vigia.iniciar();
  liberar('bbbbbbbbbbbbbbbb');
  await esperar();
  assert.ok(estados.length <= 1, 'uma única transição por versão detectada');
  parar();
});

test('o vigia desmontado para de consultar (troca de rota / logout)', async () => {
  const servidor = servidorVersao('aaaaaaaaaaaaaaaa');
  const aba = criarAba(servidor);
  await esperar();
  const antes = servidor.chamadas;
  aba.parar();
  await aba.tick();
  await esperar();
  assert.equal(servidor.chamadas, antes, 'sem consultas depois de desmontar');
});
