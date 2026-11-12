'use strict';

/**
 * Sobe o **servidor real** (`server.js`, sem nenhuma alteração) contra o
 * PostgreSQL descartável e fala HTTP de verdade com ele.
 *
 * Por que uma cópia isolada do diretório da aplicação:
 *
 *  - o rate limit é em memória e por processo (`db/rateLimit.js`), então o
 *    teste precisa de um processo só dele: subir `server.js` na raiz encheria
 *    de buckets o mesmo processo que outro teste usa;
 *  - a janela é de 5 minutos. Em vez de dormir 5 minutos (inviável em CI),
 *    o processo filho recebe um `--require` que desloca **apenas** as leituras
 *    de `Date.now()` feitas de dentro do `db/rateLimit.js` da cópia. Nada mais
 *    no processo vê o relógio deslocado — expiração de sessão, timestamps de
 *    banco e logs continuam no tempo real;
 *  - o deslocamento entra por `--require`, não por edição de arquivo: as
 *    cópias de `server.js`, `db/**` e `security/**` são verificadas com
 *    SHA-256 contra a árvore de trabalho, então a suíte prova que está
 *    exercitando exatamente o código de produção.
 *
 * Por padrão, assets estáticos não são copiados: os testes de API só chamam
 * `/api/**` e `/healthz`. O E2E do retorno Google usa `servirSpa: true` para
 * compartilhar o build real e `preCarregamentoExtra` para simular somente os
 * dois endpoints externos do Google, sem alterar o servidor ou suas proteções.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');

const RAIZ = path.join(__dirname, '..', '..');

/**
 * Só os diretórios/arquivos que o `server.js` precisa para servir a API.
 * `lib/` entrou com o identificador de build (#301): o servidor lê
 * `lib/build-version.js` para responder `/api/version`.
 */
const DIRETORIOS = ['db', 'lib', 'security', 'server'];
const ARQUIVOS = ['server.js', 'package.json'];

const PRONTO_TIMEOUT_MS = 60_000;
const ENCERRAR_TIMEOUT_MS = 10_000;

/**
 * Trava de segurança: a suíte só pode falar com um banco descartável de teste.
 * Mesmo contrato das demais integrações do repositório (`tests/postgres-*.test.cjs`),
 * repetido aqui para o harness nunca ser usado contra outro banco.
 */
function exigirAmbienteDeTeste() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Defina DATABASE_URL apontando para um banco descartável de teste.');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL inválida.');
  }
  if (!['127.0.0.1', 'localhost', 'postgres'].includes(parsed.hostname)) {
    throw new Error(`Integração bloqueada: host "${parsed.hostname}" não é o PostgreSQL descartável.`);
  }
  if (parsed.pathname !== '/qradmin_test') {
    throw new Error(`Integração bloqueada: database "${parsed.pathname}" deve ser qradmin_test.`);
  }
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Integração exige NODE_ENV=test.');
  }
}

function sha256(arquivo) {
  return crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
}

/** Lista recursiva de arquivos relativos de um diretório. */
function arquivosDe(dir) {
  const saida = [];
  const visitar = (atual) => {
    for (const entrada of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, entrada.name);
      if (entrada.isDirectory()) visitar(completo);
      else if (entrada.isFile()) saida.push(path.relative(dir, completo));
    }
  };
  visitar(dir);
  return saida.sort();
}

function assertBuildDisponivel() {
  if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
    throw new Error('E2E do retorno Google exige o build real. Execute npm run build antes.');
  }
}

function copiarAplicacao(destino) {
  for (const nome of DIRETORIOS) {
    const origem = path.join(RAIZ, nome);
    const alvo = path.join(destino, nome);
    for (const relativo of arquivosDe(origem)) {
      const arquivoAlvo = path.join(alvo, relativo);
      fs.mkdirSync(path.dirname(arquivoAlvo), { recursive: true });
      fs.copyFileSync(path.join(origem, relativo), arquivoAlvo);
    }
  }
  for (const nome of ARQUIVOS) {
    fs.copyFileSync(path.join(RAIZ, nome), path.join(destino, nome));
  }
}

/**
 * Confere que a cópia é byte a byte igual ao código da árvore de trabalho.
 * Se alguém "consertar" o teste alterando a cópia, isto falha.
 */
function conferirIntegridade(copia) {
  const divergencias = [];
  const comparar = (relativo) => {
    const original = path.join(RAIZ, relativo);
    const clonado = path.join(copia, relativo);
    if (!fs.existsSync(clonado) || sha256(original) !== sha256(clonado)) {
      divergencias.push(relativo);
    }
  };
  for (const nome of DIRETORIOS) {
    for (const relativo of arquivosDe(path.join(RAIZ, nome))) comparar(path.join(nome, relativo));
  }
  for (const nome of ARQUIVOS) comparar(nome);
  if (divergencias.length) {
    throw new Error(`Cópia isolada divergiu do código de produção: ${divergencias.join(', ')}`);
  }
}

/**
 * Pré-carregamento do processo filho.
 *
 * `Date.now` só é deslocado quando a chamada parte de `db/rateLimit.js` da
 * cópia isolada — a delimitação é feita pela pilha da chamada, e o caminho
 * absoluto da cópia aparece em `stack`. Assim o código de produção roda
 * literalmente como roda em produção; o que muda é somente o relógio que o
 * limitador consulta.
 */
function escreverPreCarregamento(arquivo, moduloRateLimit) {
  const conteudo = `'use strict';
// Gerado pelo harness de testes (tests/helpers/public-table-server.cjs).
const MODULO_RATE_LIMIT = ${JSON.stringify(moduloRateLimit)};
const relogioReal = Date.now;
let deslocamentoMs = 0;

Date.now = function DateNowComDeslocamentoDeTeste() {
  const pilha = new Error().stack || '';
  return relogioReal() + (pilha.includes(MODULO_RATE_LIMIT) ? deslocamentoMs : 0);
};

process.on('message', (mensagem) => {
  if (!mensagem || mensagem.tipo !== 'avancar-relogio') return;
  deslocamentoMs += Number(mensagem.ms) || 0;
  if (process.send) process.send({ tipo: 'relogio-avancado', deslocamentoMs, id: mensagem.id });
});

if (process.send) process.send({ tipo: 'pre-carregamento-ativo' });
`;
  fs.writeFileSync(arquivo, conteudo);
}

function portaSolicitada() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Cliente HTTP mínimo: conexão nova por chamada e IP de origem escolhível.
 *
 * `streamMs` existe para rotas SSE: um `text/event-stream` nunca emite `end`,
 * então o cliente espera a janela indicada, coleta o que chegou e encerra o
 * socket por conta própria. Sem isso o teste ficaria pendurado no timeout.
 */
function httpRequest(base, metodo, caminho, { corpo, ip, headers, streamMs = 0, timeoutMs = 15_000 } = {}) {
  const url = new URL(caminho, base);
  const dados = corpo === undefined ? null : Buffer.from(JSON.stringify(corpo));
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: metodo.toUpperCase(),
        headers: {
          ...(dados ? { 'content-type': 'application/json', 'content-length': dados.length } : {}),
          ...(headers || {}),
        },
        // Conexão nova: o IP observado pelo servidor não pode ser reaproveitado
        // de um socket anterior (keep-alive mascararia o teste de isolamento).
        agent: false,
        // Permite simular dois clientes distintos no loopback (127.0.0.1 / 127.0.0.2).
        ...(ip ? { localAddress: ip } : {}),
      },
      (res) => {
        const partes = [];
        const finalizar = () => {
          const texto = Buffer.concat(partes).toString('utf8');
          let json = null;
          try {
            json = texto ? JSON.parse(texto) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, texto, json });
        };
        // Janela curta para stream: coleta o "hello" e encerra a conexão.
        if (streamMs > 0) {
          const timer = setTimeout(() => {
            res.removeAllListeners('end');
            req.destroy();
            finalizar();
          }, streamMs);
          timer.unref();
        }
        res.on('data', (c) => partes.push(c));
        res.on('end', finalizar);
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout em ${metodo} ${caminho}`)));
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

async function esperarHealthz(base, aoFalhar) {
  const limite = Date.now() + PRONTO_TIMEOUT_MS;
  while (Date.now() < limite) {
    if (aoFalhar && aoFalhar()) return false;
    try {
      const r = await httpRequest(base, 'GET', '/healthz', { timeoutMs: 2000 });
      if (r.status === 200) return true;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Sobe o servidor real em cópia isolada.
 *
 * @param {{ env?: Record<string,string>, servirSpa?: boolean, preCarregamentoExtra?: string }} opcoes
 * @returns {Promise<{ base: string, request: Function, avancarRelogio: Function,
 *   logs: Function, pid: number, encerrar: Function }>}
 */
async function subirServidor({ env = {}, servirSpa = false, preCarregamentoExtra } = {}) {
  exigirAmbienteDeTeste();

  const raizTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), 'qradmin-public-table-'));
  const copia = path.join(raizTemporaria, 'app');
  fs.mkdirSync(copia, { recursive: true });
  copiarAplicacao(copia);
  conferirIntegridade(copia);

  // Só as dependências são compartilhadas; nenhum arquivo da aplicação.
  fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(raizTemporaria, 'node_modules'), 'dir');
  if (servirSpa) {
    assertBuildDisponivel();
    for (const dir of ['dist', 'public']) {
      fs.symlinkSync(path.join(RAIZ, dir), path.join(copia, dir), 'dir');
    }
  }

  const preCarregamento = path.join(raizTemporaria, 'pre-carregamento-relogio.cjs');
  const moduloRateLimit = path.join(fs.realpathSync(copia), 'db', 'rateLimit.js');
  escreverPreCarregamento(preCarregamento, moduloRateLimit);

  const porta = await portaSolicitada();
  const base = `http://127.0.0.1:${porta}`;
  const filho = fork(path.join(copia, 'server.js'), [], {
    cwd: raizTemporaria,
    execArgv: ['--require', preCarregamento, ...(preCarregamentoExtra ? ['--require', preCarregamentoExtra] : [])],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(porta),
      STAFF_SEED_PASSWORD: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  let log = '';
  filho.stdout.on('data', (d) => {
    log += d;
  });
  filho.stderr.on('data', (d) => {
    log += d;
  });

  let encerrado = false;
  const encerrar = async () => {
    if (encerrado) return;
    encerrado = true;
    if (filho.exitCode === null && filho.signalCode === null) {
      const saiu = new Promise((resolve) => filho.once('exit', resolve));
      filho.kill('SIGTERM');
      const prazo = setTimeout(() => {
        if (filho.exitCode === null && filho.signalCode === null) filho.kill('SIGKILL');
      }, ENCERRAR_TIMEOUT_MS);
      prazo.unref();
      await saiu;
      clearTimeout(prazo);
    }
    fs.rmSync(raizTemporaria, { recursive: true, force: true });
  };

  try {
    const subiu = await esperarHealthz(base, () => filho.exitCode !== null);
    if (!subiu) {
      throw new Error(`Servidor não respondeu em ${base}.\n--- log do servidor ---\n${log.slice(-4000)}`);
    }
  } catch (erro) {
    await encerrar();
    throw erro;
  }

  let sequenciaRelogio = 0;
  const avancarRelogio = (ms) =>
    new Promise((resolve, reject) => {
      const id = ++sequenciaRelogio;
      const prazo = setTimeout(
        () => reject(new Error('O processo do servidor não confirmou o avanço do relógio de teste.')),
        5000
      );
      const aoReceber = (mensagem) => {
        if (!mensagem || mensagem.id !== id) return;
        clearTimeout(prazo);
        filho.off('message', aoReceber);
        resolve(mensagem.deslocamentoMs);
      };
      filho.on('message', aoReceber);
      filho.send({ tipo: 'avancar-relogio', ms, id });
    });

  return {
    base,
    pid: filho.pid,
    request: (metodo, caminho, opcoes) => httpRequest(base, metodo, caminho, opcoes),
    avancarRelogio,
    logs: () => log,
    encerrar,
  };
}

module.exports = {
  RAIZ,
  exigirAmbienteDeTeste,
  subirServidor,
  httpRequest,
};
