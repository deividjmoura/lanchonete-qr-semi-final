const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const serverSource = fs.readFileSync('server.js', 'utf8');

test('rotas de comprovante do caixa e admin aceitam apenas IDs numéricos', () => {
  assert.ok(serverSource.includes("p.match(/^\\\\/api\\\\/caixa\\\\/sessoes\\\\/(\\\\d+)\\\\/comprovante$/)"));
  assert.ok(serverSource.includes("p.match(/^\\\\/api\\\\/admin\\\\/sessoes\\\\/(\\\\d+)\\\\/comprovante$/)"));

  const caixa = /^\\/api\\/caixa\\/sessoes\\/(\\d+)\\/comprovante$/;
  const admin = /^\\/api\\/admin\\/sessoes\\/(\\d+)\\/comprovante$/;
  assert.equal(caixa.test('/api/caixa/sessoes/123/comprovante'), true);
  assert.equal(caixa.test('/api/caixa/sessoes/12x/comprovante'), false);
  assert.equal(admin.test('/api/admin/sessoes/123/comprovante'), true);
  assert.equal(admin.test('/api/admin/sessoes/abc/comprovante'), false);
});

test('rotas de comprovante passam pela autorização e preservam erro de domínio', () => {
  const guard = serverSource.indexOf("if (p.startsWith('/api/admin'))");
  const caixaRoute = serverSource.indexOf("/api\\\\/caixa\\\\/sessoes\\\\/(\\\\d+)\\\\/comprovante");
  const adminRoute = serverSource.indexOf("/api\\\\/admin\\\\/sessoes\\\\/(\\\\d+)\\\\/comprovante");
  assert.notEqual(guard, -1);
  assert.ok(caixaRoute > guard, 'rota do caixa deve passar pelo middleware de autorização');
  assert.ok(adminRoute > guard, 'rota admin deve passar pelo middleware de autorização');
  assert.ok(serverSource.includes('ErroComprovante'), 'erro de domínio deve continuar tratado');
});
