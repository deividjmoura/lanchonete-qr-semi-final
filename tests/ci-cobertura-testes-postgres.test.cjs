'use strict';

/**
 * Nenhum `tests/postgres-*.test.cjs` pode ficar fora do CI.
 *
 * Motivo: o `scripts/run-tests.js` exclui de propósito os arquivos `postgres-*`
 * do `npm test` (eles exigem banco descartável) e o workflow
 * `postgres-integration.yml` só executa os arquivos listados à mão. Resultado:
 * três PRs seguidas adicionaram testes de integração que nunca rodaram em job
 * nenhum — `postgres-pagamento-operador-id`, `postgres-autoria-dispositivo-
 * compartilhado` e outros dois — e o CI ficava verde sem exercitar o código.
 *
 * Este teste fecha a porta: arquivo novo em `tests/postgres-*.test.cjs` obriga
 * um step correspondente. Se a intenção for não rodar, o arquivo não deve morar
 * nesse diretório.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(raiz, '.github', 'workflows', 'postgres-integration.yml'),
  'utf8'
);

const arquivos = fs
  .readdirSync(path.join(raiz, 'tests'))
  .filter((nome) => nome.startsWith('postgres-') && nome.endsWith('.test.cjs'))
  .sort();

test('todo teste postgres-* está referenciado no workflow de integração', () => {
  assert.ok(arquivos.length > 0, 'há testes de integração na árvore');

  const orfaos = arquivos.filter((nome) => !workflow.includes(nome));
  assert.deepEqual(
    orfaos,
    [],
    'arquivos sem step no postgres-integration.yml (eles nunca rodam):\n  ' +
      orfaos.map((nome) => `tests/${nome}`).join('\n  ')
  );
});

test('o workflow não aponta para arquivos de teste inexistentes', () => {
  const citados = [...workflow.matchAll(/tests\/(postgres-[a-z0-9-]+\.test\.cjs)/g)].map((m) => m[1]);
  assert.ok(citados.length > 0, 'o workflow executa testes de integração');

  const fantasmas = [...new Set(citados)].filter(
    (nome) => !fs.existsSync(path.join(raiz, 'tests', nome))
  );
  assert.deepEqual(fantasmas, [], 'steps apontando para arquivos que não existem');
});
