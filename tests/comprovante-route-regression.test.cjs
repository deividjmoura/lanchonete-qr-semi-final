const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('as duas rotas de comprovante aceitam IDs numéricos com regex correta', () => {
  const lines = server.split('\n').filter((line) => line.includes('/comprovante$/'));
  assert.equal(lines.length, 2, 'devem existir as rotas de caixa e admin');
  assert.ok(lines.every((line) => line.includes(String.raw`(\d+)`)));
  assert.ok(lines.every((line) => !line.includes(String.raw`(\\d+)`)));
});

test('o padrão de rota de comprovante casa IDs numéricos e rejeita texto', () => {
  const caixa = new RegExp(String.raw`^/api/caixa/sessoes/(\d+)/comprovante$`);
  const admin = new RegExp(String.raw`^/api/admin/sessoes/(\d+)/comprovante$`);
  assert.equal(caixa.exec('/api/caixa/sessoes/123/comprovante')?.[1], '123');
  assert.equal(admin.exec('/api/admin/sessoes/456/comprovante')?.[1], '456');
  assert.equal(caixa.test('/api/caixa/sessoes/abc/comprovante'), false);
});
