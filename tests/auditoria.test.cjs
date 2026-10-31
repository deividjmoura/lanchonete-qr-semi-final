'use strict';

// Issue #48: trilha de auditoria. Os testes com PostgreSQL real ficam em
// tests/postgres-*.test.cjs (CI); aqui a trilha é validada de forma hermética
// com um cliente falso, além do cabeamento estrutural no servidor.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:5432/qradmin_test';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  registrarEvento,
  limparContexto,
  normalizarEvento,
} = require('../db/auditoria');

function clienteFake() {
  const chamadas = [];
  return {
    chamadas,
    async query(sql, params) {
      chamadas.push({ sql, params });
      return { rows: [{ id: 77 }] };
    },
  };
}

test('normaliza evento completo e mantém apenas campos conhecidos', () => {
  const e = normalizarEvento({
    atorTipo: 'staff',
    atorId: 3,
    atorNome: 'caixa',
    acao: 'sessao_fechada',
    alvoTipo: 'sessao',
    alvoId: '42',
    resultado: 'sucesso',
    contexto: { valor: 10.25 },
    requestId: 'req-123',
  });
  assert.deepEqual(e, {
    atorTipo: 'staff',
    atorId: 3,
    atorNome: 'caixa',
    acao: 'sessao_fechada',
    alvoTipo: 'sessao',
    alvoId: '42',
    resultado: 'sucesso',
    contexto: { valor: 10.25 },
    requestId: 'req-123',
  });
});

test('rejeita ator/resultado inválidos e ação ausente', () => {
  assert.throws(() => normalizarEvento({ atorTipo: 'hacker', acao: 'x' }), /ator de auditoria inválido/);
  assert.throws(() => normalizarEvento({ atorTipo: 'staff', acao: 'x', resultado: 'talvez' }), /resultado de auditoria inválido/);
  assert.throws(() => normalizarEvento({ atorTipo: 'staff' }), /evento de auditoria exige ação/);
});

test('remove chaves sensíveis do contexto e nunca serializa segredos', () => {
  const limpo = limparContexto({
    mesaNumero: 4,
    senha: 'segredo',
    token: 'uuid',
    pixChave: 'email@example.com',
    cookie: 'sid',
    valor: 12,
  });
  assert.deepEqual(limpo, { mesaNumero: 4, valor: 12 });
  const serializado = JSON.stringify(limpo);
  assert.doesNotMatch(serializado, /segredo|uuid|email@example|sid/);
});

test('corta contexto acima do limite em vez de vazar payload grande', () => {
  const enorme = {};
  for (let i = 0; i < 80; i += 1) enorme[`campo${i}`] = 'x'.repeat(100);
  const limpo = limparContexto(enorme);
  assert.deepEqual(limpo, { aviso: 'contexto reduzido pelo limite de tamanho' });
  assert.ok(JSON.stringify(limpo).length <= 4200);
});

test('registrarEvento usa o client da transação e devolve o id gravado', async () => {
  const client = clienteFake();
  const gravado = await registrarEvento(client, {
    atorTipo: 'cliente_mesa',
    atorId: 9,
    acao: 'pedido_cancelado',
    alvoTipo: 'pedido',
    alvoId: '55',
    contexto: { mesaNumero: 9 },
    requestId: 'req-9',
  });
  assert.equal(gravado.id, 77);
  assert.equal(client.chamadas.length, 1);
  const { sql, params } = client.chamadas[0];
  assert.match(sql, /INSERT INTO auditoria_eventos/);
  assert.deepEqual(params, [
    'cliente_mesa', 9, null, 'pedido_cancelado', 'pedido', '55',
    'sucesso', JSON.stringify({ mesaNumero: 9 }), 'req-9',
  ]);
});

test('cancelamento, PIX e fechamento estão ligados à trilha no código de produção', () => {
  const pedidos = fs.readFileSync(path.join(__dirname, '..', 'db', 'pedidos.js'), 'utf8');
  const caixa = fs.readFileSync(path.join(__dirname, '..', 'db', 'caixa.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  // cancelamento preserva o pedido e grava histórico/auditoria na mesma transação
  const cancelIdx = pedidos.indexOf("acao:'pedido_cancelado'");
  assert.ok(cancelIdx > 0);
  assert.ok(pedidos.slice(cancelIdx - 700, cancelIdx).includes('registrarEvento'));
  assert.ok(pedidos.slice(cancelIdx - 700, cancelIdx).includes("gravarStatusItem(client,item,'cancelado'"));
  assert.doesNotMatch(pedidos.slice(cancelIdx - 700, cancelIdx + 300), /DELETE FROM pedidos/);
  const itens = fs.readFileSync(path.join(__dirname, '..', 'db', 'itens-operacoes.js'), 'utf8');
  assert.match(itens, /acao:'item_cancelado'/);
  assert.match(itens, /restaurarEstoqueDoPedido\(client,item\.pedido_id,\[id\]\)/);

  // caixa audita confirmação de PIX e fechamento com o operador
  assert.match(caixa, /acao: 'pagamento_parcial'/);
  assert.match(caixa, /acao: 'pix_confirmado'/);
  assert.match(caixa, /acao: 'sessao_fechada'/);
  assert.match(caixa, /atorTipo: opcoes\.atorTipo \|\|/);
  assert.match(caixa, /requestId: opcoes\.requestId \|\| null/);

  // rotas passam a identidade do staff e o request id
  assert.match(server, /confirmarPixAviso\(\s*Number\(m\[1\]\), Number\(m\[2\]\), operador\?\.nome \|\| null, \{[\s\S]*?requestId: reqId/);
  assert.match(server, /fecharSessao\(Number\(m\[1\]\), dados, operador\?\.nome \|\| null, \{[\s\S]*?requestId: reqId/);
  assert.match(server, /registrarPagamento\(Number\(m\[1\]\), await body\(req\), operador\?\.nome \|\| null, null, \{[\s\S]*?requestId: reqId/);
  assert.match(server, /cancelarPedidoCliente\(m\[1\], Number\(m\[2\]\), null, \{ requestId: reqId \}\)/);
});

test('migration 0025 cria a tabela sem colunas de segredo e com índices de consulta', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '0025_auditoria_eventos.sql'),
    'utf8'
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS auditoria_eventos/);
  assert.match(sql, /CHECK \(ator_tipo IN \('staff', 'garcom', 'cliente_mesa', 'sistema'\)\)/);
  assert.match(sql, /CHECK \(resultado IN \('sucesso', 'negado', 'falha'\)\)/);
  assert.match(sql, /idx_auditoria_eventos_criado/);
  // comentários podem mencionar segredos; as DEFINIÇÕES de coluna não podem
  const soColunas = sql.split('\n').filter((linha) => !linha.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(soColunas, /senha|hash|token|segredo/i);
});
