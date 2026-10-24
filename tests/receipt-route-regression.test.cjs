const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const serverSource = fs.readFileSync('server.js', 'utf8');

test('rotas de comprovante do caixa e admin aceitam apenas IDs numéricos', () => {
  const routes = [
    {
      source: /^    if \(\(m = p\.match\(\/^\\\\\/api\\\\\/caixa\\\\\/sessoes\\\\\/\(\\\\d\+\)\\\\\/comprovante\$\/\)\) && req\.method === 'GET'\) \{/m,
      route: /^\/api\/caixa\/sessoes\/(\d+)\/comprovante$/,
    },
    {
      source: /^    if \(\(m = p\.match\(\/^\\\\\/api\\\\\/admin\\\\\/sessoes\\\\\/\(\\\\d\+\)\\\\\/comprovante\$\/\)\) && req\.method === 'GET'\) \{/m,
      route: /^\/api\/admin\/sessoes\/(\d+)\/comprovante$/,
    },
  ];

  for (const { source, route } of routes) {
    assert.match(serverSource, source, 'a rota deve usar \d+ sem escape duplicado');
    assert.match('/api/caixa/sessoes/123/comprovante', route);
    assert.match('/api/admin/sessoes/123/comprovante', route);
    assert.equal(route.test('/api/caixa/sessoes/abc/comprovante'), false);
    assert.equal(route.test('/api/admin/sessoes/12x/comprovante'), false);
  }
});

test('rotas de comprovante ficam depois da autenticação por papel e preservam erro de domínio', () => {
  const guard = serverSource.indexOf("if (p.startsWith('/api/admin'))");
  const caixaRoute = serverSource.indexOf("p.match(/^\\/api\\/caixa\\/sessoes\\/(\\d+)\\/comprovante$/)");
  const adminRoute = serverSource.indexOf("p.match(/^\\/api\\/admin\\/sessoes\\/(\\d+)\\/comprovante$/)");

  assert.notEqual(guard, -1);
  assert.ok(caixaRoute > guard, 'rota do caixa deve passar pelo middleware de autorização');
  assert.ok(adminRoute > guard, 'rota admin deve passar pelo middleware de autorização');
  assert.match(serverSource, /catch\(e\) \{ if\(e instanceof ErroComprovante\) return json\(res,e\.status,\{error:e\.message\}\); throw e; \}/);
});
