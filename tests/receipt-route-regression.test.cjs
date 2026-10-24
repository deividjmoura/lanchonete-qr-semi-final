const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const serverSource = fs.readFileSync('server.js', 'utf8');

test('rotas de comprovante do caixa e admin aceitam apenas IDs numéricos', () => {
  const routes = [
    {
      source: String.raw\`p.match(/^\\/api\\/caixa\\/sessoes\\/(\\d+)\\/comprovante$/)\`,
      route: /^\/api\/caixa\/sessoes\/(\d+)\/comprovante$/,
      valid: '/api/caixa/sessoes/123/comprovante',
      invalid: '/api/caixa/sessoes/12x/comprovante',
    },
    {
      source: String.raw\`p.match(/^\\/api\\/admin\\/sessoes\\/(\\d+)\\/comprovante$/)\`,
      route: /^\/api\/admin\/sessoes\/(\d+)\/comprovante$/,
      valid: '/api/admin/sessoes/123/comprovante',
      invalid: '/api/admin/sessoes/abc/comprovante',
    },
  ];

  for (const { source, route, valid, invalid } of routes) {
    assert.ok(serverSource.includes(source), 'server.js deve usar \\d+ sem escape duplicado');
    assert.equal(route.test(valid), true);
    assert.equal(route.test(invalid), false);
  }
});

test('rotas de comprovante passam pela autorização e preservam erro de domínio', () => {
  const guard = serverSource.indexOf("if (p.startsWith('/api/admin'))");
  const caixaRoute = serverSource.indexOf(String.raw\`p.match(/^\\/api\\/caixa\\/sessoes\\/(\\d+)\\/comprovante$/)\`);
  const adminRoute = serverSource.indexOf(String.raw\`p.match(/^\\/api\\/admin\\/sessoes\\/(\\d+)\\/comprovante$/)\`);

  assert.notEqual(guard, -1);
  assert.ok(caixaRoute > guard, 'rota do caixa deve passar pelo middleware de autorização');
  assert.ok(adminRoute > guard, 'rota admin deve passar pelo middleware de autorização');
  assert.match(serverSource, /ErroComprovante\\) return json\\(res,e\\.status,\\{error:e\\.message\\}\\)/);
});
