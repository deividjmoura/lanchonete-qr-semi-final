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

const caixaSource = fs.readFileSync('src/screens/Caixa.tsx', 'utf8');
const storeSource = fs.readFileSync('src/store/usePub.ts', 'utf8');

test('QR PIX acompanha o valor digitado na divisão da conta', () => {
  assert.ok(caixaSource.includes('valor: Number(valor) > 0.005 ? Number(valor)'));
  assert.ok(caixaSource.includes('forma === "pix"'));
  assert.ok(caixaSource.includes('Confirme o recebimento na maquininha ou no caixa antes de registrar'));
});

test('quitação integral simples tenta fechar a sessão e atualizar mesas', () => {
  assert.ok(storeSource.includes('pagamentoFinalSimples'));
  assert.ok(storeSource.includes('await api.fecharSessao(sessaoId'));
  assert.ok(storeSource.includes('await get().hydrateMesas().catch(() => null)'));
  assert.ok(storeSource.includes('Pagamento registrado, mas a mesa continua aberta'));
});

test('hydrateCaixa não preserva pedidos operacionais de sessões já fechadas', () => {
  assert.ok(storeSource.includes('idsVivos.has(p.sessaoId)'));
});

const caixaDbSource = fs.readFileSync('db/caixa.js', 'utf8');
const comprovanteDbSource = fs.readFileSync('db/comprovante.js', 'utf8');
const paymentMigrationSource = fs.readFileSync('db/migrations/0022_sessao_pagamentos_operador.sql', 'utf8');

test('pagamentos registram o operador autenticado e o mostram no histórico', () => {
  assert.ok(serverSource.includes('operador?.nome || null'));
  assert.ok(caixaDbSource.includes('operador_nome'));
  assert.ok(caixaDbSource.includes('operadorNome: ins[0].operador_nome || null'));
  assert.ok(caixaSource.includes('registrado por {pg.operadorNome}'));
  assert.ok(paymentMigrationSource.includes('ADD COLUMN IF NOT EXISTS operador_nome'));
});

test('comprovante final preserva o operador responsável por cada pagamento', () => {
  assert.ok(comprovanteDbSource.includes('operadorNome:p.operador_nome||null'));
  assert.ok(printSource.includes('registrado por ${esc(p.operadorNome)}'));
});
