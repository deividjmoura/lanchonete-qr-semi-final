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


test('comprovante detalha preço unitário, observações e operador quando disponíveis', () => {
  const printSource = fs.readFileSync('src/lib/print.ts', 'utf8');
  const receiptSource = fs.readFileSync('db/comprovante.js', 'utf8');
  assert.ok(printSource.includes('Unitário:'));
  assert.ok(printSource.includes('Obs. item:'));
  assert.ok(printSource.includes('operadorNome'));
  assert.ok(receiptSource.includes('observacaoPedido'));
  assert.ok(receiptSource.includes('operador_nome'));
});

test('quitação de pagamento atualiza caixa e mesas', () => {
  const storeSource = fs.readFileSync('src/store/usePub.ts', 'utf8');
  assert.ok(storeSource.includes('await get().hydrateMesas().catch(() => null)'));
});

test('hydrateCaixa descarta cards operacionais de sessões já fechadas', () => {
  const storeSource = fs.readFileSync('src/store/usePub.ts', 'utf8');
  assert.ok(storeSource.includes('idsVivos.has(p.sessaoId)'));
});

test('QR PIX acompanha o valor digitado e gera TXID por lançamento', () => {
  const caixaSource = fs.readFileSync('src/screens/Caixa.tsx', 'utf8');
  assert.ok(caixaSource.includes('valor: Number(valor) > 0.005 ? Number(valor)'));
  assert.ok(caixaSource.includes('txid: `S${sessao.id}P${sessao.pagamentos.length + 1}`'));
  assert.ok(caixaSource.includes('forma === "pix"'));
  assert.ok(caixaSource.includes('Confira o recebimento no banco antes de registrar'));
});


test('pagamento PWA exige responsável atual dentro da transação e mantém retry idempotente', () => {
  const serverSource = fs.readFileSync('server.js', 'utf8');
  const caixaSource = fs.readFileSync('db/caixa.js', 'utf8');
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(serverSource, /\/api\/garcom\/\(\[\^\/\]\+\)\/sessoes\/\(\\d\+\)\/pagamentos/);
  assert.ok(serverSource.includes('registrarPagamento(Number(m[2]), payload, garcom.nome, garcom.id)'));
  assert.ok(caixaSource.includes('SELECT id, ativo FROM garcons WHERE id = $1 FOR SHARE'));
  assert.ok(caixaSource.includes('sessao.garcom_responsavel_id'));
  assert.ok(caixaSource.includes('idempotencyKeyDoCorpo(body)'));
  assert.match(workflow, /image: postgres:16/);
  assert.ok(workflow.includes('tests/postgres-financial-integration.test.cjs'));
  assert.ok(workflow.includes('tests/postgres-waiter-integration.test.cjs'));
});
