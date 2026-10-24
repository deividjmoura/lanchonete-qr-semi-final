const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('rotas de comprovante aceitam IDs numéricos e rejeitam IDs inválidos', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const lines = source.split('\n').filter((line) => line.includes('comprovante$/'));
  assert.equal(lines.length, 2, 'esperava exatamente as rotas de caixa e admin');

  for (const line of lines) {
    const start = line.indexOf('p.match(') + 'p.match('.length;
    const end = line.indexOf(')) && req.method', start);
    assert.ok(start >= 'p.match('.length && end > start, 'não foi possível localizar a regex da rota');
    const literal = line.slice(start, end).trim();
    assert.ok(literal.startsWith('/') && literal.endsWith('/'), 'esperava uma regex literal');
    const regex = new RegExp(literal.slice(1, -1).replace(/\\\//g, '/'));
    const prefix = line.includes('caixa')
      ? '/api/caixa/sessoes/'
      : '/api/admin/sessoes/';

    const valid = regex.exec(prefix + '42/comprovante');
    assert.ok(valid, 'ID numérico válido deve casar');
    assert.equal(valid[1], '42');
    assert.equal(regex.test(prefix + 'abc/comprovante'), false);
    assert.equal(regex.test(prefix + '42/comprovante/extra'), false);
  }
});
