require('dotenv').config();

// These contract tests reject malformed requests before acquiring a DB client.
// The URL is deliberately local and is never contacted by these cases.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://regress:regress@127.0.0.1:5432/regress';
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarPedido, ErroPedido } = require('../db/pedidos');

function rejeicao400(promise) {
  return assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErroPedido);
    assert.equal(error.status, 400);
    return true;
  });
}

test('criação de pedido rejeita corpo ausente, não objeto e array', async () => {
  await rejeicao400(criarPedido('token-mesa', null));
  await rejeicao400(criarPedido('token-mesa', 'pedido'));
  await rejeicao400(criarPedido('token-mesa', []));
});

test('criação de pedido rejeita carrinho ausente ou vazio antes de abrir conexão', async () => {
  await rejeicao400(criarPedido('token-mesa', {}));
  await rejeicao400(criarPedido('token-mesa', { items: [] }));
  await rejeicao400(criarPedido('token-mesa', { items: 'produto' }));
});

test('criação de pedido rejeita chave de idempotência malformada antes do banco', async () => {
  await rejeicao400(criarPedido('token-mesa', {
    idempotencyKey: 'bad key!',
    items: [{ productId: 1, qty: 1 }],
  }));
  await rejeicao400(criarPedido('token-mesa', {
    idempotency_key: 42,
    items: [{ productId: 1, qty: 1 }],
  }));
});

test('normalização de idempotência aceita chave válida não-UUID e rejeita formatos inválidos', () => {
  const { idempotencyKeyDoCorpo } = require('../db/conta');

  assert.equal(idempotencyKeyDoCorpo({ idempotencyKey: 'order-key-123' }), 'order-key-123');
  assert.equal(idempotencyKeyDoCorpo({ idempotencyKey: 'bad key!' }), false);
  assert.equal(idempotencyKeyDoCorpo({ idempotency_key: 42 }), false);
  assert.equal(idempotencyKeyDoCorpo({}), null);
});


const { totalEntregueDaSessao, sincronizarValorTotalSessao } = require('../db/conta');
const { comRetryConcorrencia } = require('../db/retry');
const { registrarPagamento, fecharSessao, ErroCaixa } = require('../db/caixa');
const { sincronizarStatusPedido } = require('../db/pedidos');

test('status agregado acompanha itens mistos e entrega parcial sem marcar pedido como entregue cedo', async () => {
  const cases = [
    { items: ['recebido', 'recebido'], expected: 'recebido' },
    { items: ['em_producao', 'recebido'], expected: 'em_producao' },
    { items: ['concluido', 'recebido'], expected: 'em_producao' },
    { items: ['concluido', 'entregue'], expected: 'concluido' },
    { items: ['entregue', 'entregue'], expected: 'entregue' },
  ];

  for (const scenario of cases) {
    const calls = [];
    const client = {
      async query(sql, params) {
        calls.push({ sql, params });
        if (sql.includes('SELECT COALESCE(status, \'recebido\') AS status FROM itens_pedido')) {
          return { rows: scenario.items.map((status) => ({ status })) };
        }
        if (sql.includes('UPDATE pedidos SET status = $2')) {
          return { rows: [{ id: 81, status: params[1] }] };
        }
        throw new Error('Consulta inesperada no teste de status agregado');
      },
    };

    const result = await sincronizarStatusPedido(client, 81);
    assert.equal(result.status, scenario.expected, scenario.items.join(','));
    assert.equal(calls.length, 2);
    assert.equal(calls[1].params[0], 81);
    assert.equal(calls[1].params[1], scenario.expected);
  }
});

test('total devido do caixa é recomputado dos itens entregues, não do acumulador antigo', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT COALESCE(SUM(') && sql.includes('itens_pedido')) {
        return { rows: [{ total: '17.35' }] };
      }
      if (sql.includes('UPDATE mesa_sessoes SET valor_total = $2')) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error('Consulta inesperada no teste de consistência do caixa');
    },
  };

  assert.equal(await totalEntregueDaSessao(client, 44), 17.35);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /COALESCE\(ip\.status, 'recebido'\) = 'entregue'/);
  assert.deepEqual(calls[0].params, [44]);

  calls.length = 0;
  assert.equal(await sincronizarValorTotalSessao(client, 44), 17.35);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params, [44, 17.35]);
  assert.match(calls[1].sql, /status = 'aberta'/);
});

test('pagamento e fechamento rejeitam entradas inválidas antes de conectar ao banco', async () => {
  await assert.rejects(
    () => registrarPagamento(44, { formaPagamento: 'bitcoin', valor: 10 }),
    (error) => error instanceof ErroCaixa && error.status === 400
  );
  await assert.rejects(
    () => registrarPagamento(44, { formaPagamento: 'pix', valor: 0 }),
    (error) => error instanceof ErroCaixa && error.status === 400
  );
  await assert.rejects(
    () => fecharSessao(44, { formaPagamento: 'dinheiro', desconto: -1 }),
    (error) => error instanceof ErroCaixa && error.status === 400
  );
  await assert.rejects(
    () => fecharSessao(44, { formaPagamento: 'dinheiro', taxaServico: 'NaN' }),
    (error) => error instanceof ErroCaixa && error.status === 400
  );
  await assert.rejects(
    () => registrarPagamento(0, { formaPagamento: 'pix', valor: 10 }),
    (error) => error instanceof ErroCaixa && error.status === 400
  );
});

test('retry de concorrência repete apenas deadlock/serialization e retorna resultado da tentativa seguinte', async () => {
  let attempts = 0;
  const sleeps = [];
  const result = await comRetryConcorrencia(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('deadlock sintético'), { code: '40P01' });
    return { ok: true, attempt: attempts };
  }, {
    tentativas: 3,
    atrasoBaseMs: 0,
    dormir: async (ms) => sleeps.push(ms),
  });

  assert.deepEqual(result, { ok: true, attempt: 2 });
  assert.equal(attempts, 2);
  assert.equal(sleeps.length, 1);
});

test('retry não repete erro de negócio e respeita limite de tentativas de concorrência', async () => {
  let businessAttempts = 0;
  await assert.rejects(
    () => comRetryConcorrencia(async () => {
      businessAttempts += 1;
      throw Object.assign(new Error('conflito de negócio'), { status: 409 });
    }, { dormir: async () => {} }),
    /conflito de negócio/
  );
  assert.equal(businessAttempts, 1);

  let deadlockAttempts = 0;
  await assert.rejects(
    () => comRetryConcorrencia(async () => {
      deadlockAttempts += 1;
      throw Object.assign(new Error('deadlock sintético'), { code: '40P01' });
    }, { tentativas: 3, atrasoBaseMs: 0, dormir: async () => {} }),
    /deadlock sintético/
  );
  assert.equal(deadlockAttempts, 3);
});
