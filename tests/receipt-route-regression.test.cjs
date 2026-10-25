const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const serverSource = fs.readFileSync('server.js', 'utf8');

test('rotas de comprovante usam uma regex numérica correta', () => {
  const lines = serverSource.split('\n').filter((line) => line.includes('comprovante$/'));
  assert.equal(lines.length, 2, 'devem existir as duas rotas de comprovante');
  assert.ok(lines.every((line) => line.includes('(\\d+)')), 'IDs numéricos devem usar uma classe de dígitos');
  assert.ok(lines.every((line) => !line.includes('(\\\\d+)')), 'não pode haver escape duplicado');
  const caixa = /^\/api\/caixa\/sessoes\/(\d+)\/comprovante$/;
  const admin = /^\/api\/admin\/sessoes\/(\d+)\/comprovante$/;
  assert.equal(caixa.test('/api/caixa/sessoes/123/comprovante'), true);
  assert.equal(caixa.test('/api/caixa/sessoes/12x/comprovante'), false);
  assert.equal(admin.test('/api/admin/sessoes/123/comprovante'), true);
  assert.equal(admin.test('/api/admin/sessoes/abc/comprovante'), false);
});

test('rotas de comprovante passam pela autorização e preservam erro de domínio', () => {
  const guard = serverSource.indexOf("if (p.startsWith('/api/admin'))");
  const receiptRoute = serverSource.indexOf("comprovante$/)) && req.method === 'GET') {");
  assert.notEqual(guard, -1);
  assert.ok(receiptRoute > guard, 'rotas de comprovante devem passar pelo middleware de autorização');
  assert.ok(serverSource.includes('ErroComprovante'), 'erro de domínio deve continuar tratado');
});

const printSource = fs.readFileSync('src/lib/print.ts', 'utf8');
const landingSource = fs.readFileSync('src/screens/Landing.tsx', 'utf8');

test('comprovante detalha preço unitário e adicionais dos itens', () => {
  assert.ok(printSource.includes('Unitário:'));
  assert.ok(printSource.includes('Adicionais:'));
  assert.ok(printSource.includes('TOTAL COBRADO'));
  assert.ok(printSource.includes('DOCUMENTO NÃO FISCAL'));
});

test('landing pública não apresenta diretório de mesas', () => {
  assert.ok(!landingSource.includes('mesas.map('));
  assert.ok(!landingSource.includes('Iniciar pelo QR da mesa:'));
});
