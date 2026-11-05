'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const smoke = fs.readFileSync(path.join(root, 'scripts/health-smoke.js'), 'utf8');

test('health endpoint is GET-only, read-only and never mutates state', () => {
  assert.match(server, /if \(p === '\/healthz' && req.method === 'GET'\)/);

  const start = server.indexOf("if (p === '/healthz' && req.method === 'GET')");
  const block = server.slice(start, start + 900);

  // Revogação consciente da decisão anterior (05/11/2026).
  //
  // O teste antes proibia QUALQUER acesso ao banco, o que fazia o health check
  // aprovar um processo cujo banco estava fora do ar — o pior cenário ficava
  // invisível. A decisão registrada agora é: um SELECT 1 com timeout curto é
  // permitido, porque detecta a falha que importa com carga desprezível.
  //
  // O que continua PROIBIDO é o que a decisão original protegia de verdade:
  // qualquer escrita, qualquer criação de dado e qualquer consulta pesada.
  assert.match(block, /SELECT 1/, 'o health check precisa sondar o banco');
  assert.doesNotMatch(
    block,
    /INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE/i,
    'health check não pode escrever'
  );
  assert.doesNotMatch(
    block,
    /criarPedido|registrarPagamento|fecharSessao|criarSessao|registrarEvento/i,
    'health check não pode chamar operação de domínio'
  );
  assert.match(block, /statement_timeout|timeout/i, 'a sondagem precisa de timeout');
});

test('health smoke only issues a GET to an explicit /healthz URL', () => {
  assert.match(smoke, /process\.env\.HEALTHCHECK_URL \|\| process\.argv\[2\]/);
  assert.match(smoke, /method: 'GET'/);
  assert.match(smoke, /url\.pathname\.endsWith\('\/healthz'\)/);
  assert.doesNotMatch(smoke, /POST|PATCH|PUT|DELETE|criarPedido|registrarPagamento/);
});
