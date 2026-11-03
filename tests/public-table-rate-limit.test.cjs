'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server.js', 'utf8');

test('mutações públicas de mesa aplicam rate limit por operação, IP e token', () => {
  const cases = [
    { route: "checkin$/)) && req.method === 'POST'", operation: "'checkin', 5" },
    { route: "pix-informado$/)) && req.method === 'POST'", operation: "'pix', 6" },
    { route: "pedidos\\/(\\d+)$/)) && req.method === 'DELETE'", operation: "'cancelar-pedido', 5" },
    { route: "pedidos\\/(\\d+)$/)) && req.method === 'PUT'", operation: "'editar-pedido', 10" },
  ];

  for (const item of cases) {
    const start = server.indexOf(item.route);
    assert.notEqual(start, -1, `rota não encontrada: ${item.route}`);
    const handler = server.slice(start, start + 700);
    assert.ok(
      handler.includes(`mesaMutationPermitida(req, m[1], ${item.operation})`),
      `rota deve aplicar limite ${item.operation}`
    );
  }
});

test('a chave do rate limit de mutações inclui operação, IP e token da mesa', () => {
  const start = server.indexOf('function mesaMutationPermitida(');
  assert.notEqual(start, -1, 'helper de rate limit de mesa deve existir');
  const helper = server.slice(start, server.indexOf('\n}', start) + 2);
  assert.match(helper, /mesa-mut:\\$\\{operacao\\}:\\$\\{clientIp\\(req\\)\\}:\\$\\{String\\(token\\)\\}/);
  assert.match(helper, /janelaMs: 5 \\* 60 \\* 1000/);
});
