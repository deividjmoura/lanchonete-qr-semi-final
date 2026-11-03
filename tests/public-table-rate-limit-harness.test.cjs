'use strict';

// Guarda-corpo do harness de integração do rate limit (PR #196).
//
// Estes testes rodam sem banco (`npm test`) e provam duas coisas que, se
// quebrarem, fariam a suíte de integração testar o código errado:
//
//  1. o harness recusa qualquer DATABASE_URL que não seja o banco descartável;
//  2. o pré-carregamento que desloca o relógio só afeta `db/rateLimit.js` e
//     nunca o resto do processo (sessão, timestamps de banco, logs).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const { exigirAmbienteDeTeste, RAIZ: RAIZ_HARNESS } = require('./helpers/public-table-server.cjs');

const AMBIENTE = { DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5432/qradmin_test', NODE_ENV: 'test' };

function comAmbiente(vars, fn) {
  const anterior = { ...process.env };
  for (const [chave, valor] of Object.entries(vars)) {
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
  try {
    return fn();
  } finally {
    for (const chave of Object.keys(vars)) delete process.env[chave];
    Object.assign(process.env, anterior);
  }
}

test('harness aponta para a raiz do repositório', () => {
  assert.equal(path.resolve(RAIZ_HARNESS), path.resolve(RAIZ));
});

test('harness aceita apenas o banco descartável de teste', () => {
  comAmbiente(AMBIENTE, () => assert.doesNotThrow(() => exigirAmbienteDeTeste()));
  comAmbiente({ ...AMBIENTE, DATABASE_URL: undefined }, () => {
    assert.throws(() => exigirAmbienteDeTeste(), /Defina DATABASE_URL/);
  });
  comAmbiente({ ...AMBIENTE, DATABASE_URL: 'postgres://user:pass@db.producao.example:5432/qradmin_test' }, () => {
    assert.throws(() => exigirAmbienteDeTeste(), /Integração bloqueada: host/);
  });
  comAmbiente({ ...AMBIENTE, DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5432/producao' }, () => {
    assert.throws(() => exigirAmbienteDeTeste(), /deve ser qradmin_test/);
  });
  comAmbiente({ ...AMBIENTE, NODE_ENV: 'production' }, () => {
    assert.throws(() => exigirAmbienteDeTeste(), /NODE_ENV=test/);
  });
});

/**
 * Reproduz o mecanismo do pré-carregamento gerado pelo harness e confirma o
 * isolamento do relógio. Se o deslocamento vazar para fora do `db/rateLimit.js`,
 * o processo do servidor veria datas erradas (sessão, comparações em JS, logs).
 */
test('o relógio de teste só é deslocado dentro do módulo de rate limit', () => {
  const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'qradmin-relogio-'));
  try {
    const moduloRateLimit = path.join(fs.realpathSync(temporario), 'rateLimit.js');
    const outroModulo = path.join(temporario, 'outro-modulo.js');
    fs.writeFileSync(moduloRateLimit, 'module.exports = () => Date.now();\n');
    fs.writeFileSync(outroModulo, 'module.exports = () => Date.now();\n');

    // Mesmo corpo escrito por escreverPreCarregamento() no harness; aqui o
    // deslocamento inicial vem do ambiente para não precisar de IPC.
    const preCarregamento = path.join(temporario, 'pre-carregamento.cjs');
    fs.writeFileSync(
      preCarregamento,
      `'use strict';
const MODULO_RATE_LIMIT = ${JSON.stringify(moduloRateLimit)};
const relogioReal = Date.now;
let deslocamentoMs = Number(process.env.TESTE_DESLOCAMENTO_MS || 0);
Date.now = function DateNowComDeslocamentoDeTeste() {
  const pilha = new Error().stack || '';
  return relogioReal() + (pilha.includes(MODULO_RATE_LIMIT) ? deslocamentoMs : 0);
};
`
    );

    const leitor = path.join(temporario, 'leitor.cjs');
    fs.writeFileSync(
      leitor,
      `const noRateLimit = require(${JSON.stringify(moduloRateLimit)})();
       const foraDoRateLimit = require(${JSON.stringify(outroModulo)})();
       process.stdout.write(JSON.stringify({ diferenca: noRateLimit - foraDoRateLimit, agora: Date.now() }));\n`
    );

    const executar = (deslocamento) => {
      const saida = execFileSync(process.execPath, ['--require', preCarregamento, leitor], {
        encoding: 'utf8',
        cwd: RAIZ,
        timeout: 20000,
        env: { ...process.env, TESTE_DESLOCAMENTO_MS: String(deslocamento) },
      });
      return JSON.parse(saida);
    };

    // As duas leituras acontecem em milissegundos distintos, então a
    // diferença carrega o deslocamento mais o tempo real entre elas: a
    // tolerância é a folga de relógio, não uma licença para deslocar o resto.
    const TOLERANCIA_MS = 250;
    const semDeslocamento = executar(0);
    assert.ok(
      Math.abs(semDeslocamento.diferenca) <= TOLERANCIA_MS,
      `sem deslocamento os dois relógios coincidem (diferença ${semDeslocamento.diferenca} ms)`
    );

    const comDeslocamento = executar(300000);
    assert.ok(
      Math.abs(comDeslocamento.diferenca - 300000) <= TOLERANCIA_MS,
      `o deslocamento vale para o rate limit e não para o resto do processo (diferença ${comDeslocamento.diferenca} ms)`
    );
    // O relógio global do processo continua no tempo real (sem deslocamento).
    assert.ok(
      Math.abs(comDeslocamento.agora - Date.now()) < 60000,
      'o relógio global do processo não pode ser deslocado'
    );
  } finally {
    fs.rmSync(temporario, { recursive: true, force: true });
  }
});
