const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const serverSource = fs.readFileSync('server.js', 'utf8');

test('GET /api/mesas exige autenticação administrativa antes de devolver tokens', () => {
  const start = serverSource.indexOf("if (p === '/api/mesas' && req.method === 'GET')");
  assert.notEqual(start, -1, 'rota GET /api/mesas deve existir');

  const nextRoute = serverSource.indexOf("\n    if (p === '/api/admin/garcons/metricas'", start);
  assert.ok(nextRoute > start, 'deve ser possível delimitar o handler da rota');
  const handler = serverSource.slice(start, nextRoute);

  const guard = handler.indexOf("await exigirAcesso(req, 'admin')");
  const read = handler.indexOf('await listMesas()');
  const tokenOutput = handler.indexOf('token: m.token');
  assert.ok(guard >= 0, 'rota deve exigir papel admin');
  assert.ok(read > guard, 'consulta de mesas deve ocorrer só após a autorização');
  assert.ok(tokenOutput > read, 'token só pode ser incluído na resposta após a autorização');
  assert.ok(handler.includes('if (e instanceof ErroAuth) return json(res, e.status'), 'falha de autorização deve virar resposta HTTP controlada');
});

test('a rota de mesas administrativas também fica depois do gate /api/admin', () => {
  const gate = serverSource.indexOf("if (p.startsWith('/api/admin'))");
  const route = serverSource.indexOf("if (p === '/api/admin/mesas' && req.method === 'GET')");
  assert.ok(gate >= 0, 'middleware de autorização admin deve existir');
  assert.ok(route > gate, 'rota administrativa deve ser avaliada depois do middleware');
});
