'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const smoke = fs.readFileSync(path.join(root, 'scripts/health-smoke.js'), 'utf8');

test('health endpoint is GET-only, process-level and read-only', () => {
  assert.match(server, /if \(p === '\/healthz' && req\.method === 'GET'\)/);
  assert.match(server, /return json\(res, 200, \{ status: 'ok' \}\);/);
  const start = server.indexOf("if (p === '/healthz' && req.method === 'GET')");
  const block = server.slice(start, start + 260);
  assert.doesNotMatch(block, /pool\.query|criarPedido|registrarPagamento|fecharSessao/);
});

test('health smoke only issues a GET to an explicit /healthz URL', () => {
  assert.match(smoke, /process\.env\.HEALTHCHECK_URL \|\| process\.argv\[2\]/);
  assert.match(smoke, /method: 'GET'/);
  assert.match(smoke, /url\.pathname\.endsWith\('\/healthz'\)/);
  assert.doesNotMatch(smoke, /POST|PATCH|PUT|DELETE|criarPedido|registrarPagamento/);
});
