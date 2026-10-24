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
    idempotencyKey: 'not-a-uuid',
    items: [{ productId: 1, qty: 1 }],
  }));
  await rejeicao400(criarPedido('token-mesa', {
    idempotency_key: 42,
    items: [{ productId: 1, qty: 1 }],
  }));
});
