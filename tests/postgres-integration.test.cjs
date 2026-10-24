// Integração real com PostgreSQL. Executado apenas no job que provisiona o serviço descartável.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const pool = require('../db/pool');
const pedidos = require('../db/pedidos');
const caixa = require('../db/caixa');

test('pedido idempotente, entrega, pagamento parcial e fechamento persistem invariantes', async (t) => {
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname),
    'Integração bloqueada: host deve ser o PostgreSQL descartável do CI');
  assert.equal(databaseUrl.pathname, '/qradmin_test',
    'Integração bloqueada: database deve ser qradmin_test; produção nunca é permitida');
  assert.equal(process.env.NODE_ENV, 'test', 'Integração exige NODE_ENV=test');

  const token = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  let mesaId;
  let categoriaId;
  let produtoId;
  let sessaoId;

  try {
    const mesa = await pool.query(
      'INSERT INTO mesas (numero, token) VALUES ($1, $2) RETURNING id',
      [9000 + Math.floor(Math.random() * 900), token]
    );
    mesaId = mesa.rows[0].id;
    categoriaId = (await pool.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
      ['CI integração ' + suffix]
    )).rows[0].id;
    produtoId = (await pool.query(
      'INSERT INTO produtos (categoria_id, nome, preco, disponivel) VALUES ($1, $2, 12.50, TRUE) RETURNING id',
      [categoriaId, 'Produto CI ' + suffix]
    )).rows[0].id;

    const key = 'ci-' + randomUUID();
    const body = { idempotencyKey: key, items: [{ productId: produtoId, qty: 2 }] };
    const [first, retry] = await Promise.all([
      pedidos.criarPedido(token, body),
      pedidos.criarPedido(token, body),
    ]);
    assert.equal(first.id, retry.id, 'retry concorrente deve retornar o mesmo pedido');

    const persisted = await pool.query(
      'SELECT id, sessao_id, status FROM pedidos WHERE id = $1',
      [first.id]
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(persisted.rows[0].status, 'recebido');
    sessaoId = persisted.rows[0].sessao_id;

    const itemRows = await pool.query(
      'SELECT id, quantidade, preco_unitario FROM itens_pedido WHERE pedido_id = $1',
      [first.id]
    );
    assert.equal(itemRows.rowCount, 1, 'retry não pode duplicar item');
    assert.equal(itemRows.rows[0].quantidade, 2);
    assert.equal(Number(itemRows.rows[0].preco_unitario), 12.5);

    await pedidos.setStatusPedido(first.id, 'entregue');
    const totalEntregue = await pool.query(
      `SELECT SUM(ip.quantidade * ip.preco_unitario)::numeric(10,2) AS total
       FROM itens_pedido ip WHERE ip.pedido_id = $1 AND ip.status = 'entregue'`,
      [first.id]
    );
    assert.equal(Number(totalEntregue.rows[0].total), 25);
    const totalSessao = await pool.query('SELECT valor_total FROM mesa_sessoes WHERE id = $1', [sessaoId]);
    assert.equal(Number(totalSessao.rows[0].valor_total), 25);

    const paymentKey = 'pay-' + randomUUID();
    const payBody = { idempotencyKey: paymentKey, formaPagamento: 'pix', valor: 10 };
    const [payment1, paymentRetry] = await Promise.all([
      caixa.registrarPagamento(sessaoId, payBody),
      caixa.registrarPagamento(sessaoId, payBody),
    ]);
    assert.equal(payment1.pagamento.id, paymentRetry.pagamento.id);
    assert.equal(paymentRetry.valorPago, 10);

    const paymentCount = await pool.query(
      'SELECT COUNT(*)::int AS n, SUM(valor)::numeric(10,2) AS total FROM sessao_pagamentos WHERE sessao_id = $1',
      [sessaoId]
    );
    assert.equal(paymentCount.rows[0].n, 1, 'retry concorrente não pode duplicar pagamento');
    assert.equal(Number(paymentCount.rows[0].total), 10);

    const closed = await caixa.fecharSessao(sessaoId, {
      formaPagamento: 'pix', desconto: 0, taxaServico: 0,
      idempotencyKey: 'close-' + randomUUID(),
    });
    assert.equal(closed.status, 'fechada');
    assert.equal(closed.valorTotal, 25);
    assert.equal(closed.valorPago, 25);

    const finalState = await pool.query(
      `SELECT s.status, s.valor_total, s.valor_cobrado,
              (SELECT COUNT(*)::int FROM sessao_pagamentos p WHERE p.sessao_id = s.id) AS pagamentos,
              (SELECT COUNT(*)::int FROM pedidos p WHERE p.sessao_id = s.id) AS pedidos
       FROM mesa_sessoes s WHERE s.id = $1`,
      [sessaoId]
    );
    assert.equal(finalState.rows[0].status, 'fechada');
    assert.equal(Number(finalState.rows[0].valor_total), 25);
    assert.equal(Number(finalState.rows[0].valor_cobrado), 25);
    assert.equal(finalState.rows[0].pagamentos, 2, 'pagamento parcial + saldo do fechamento');
    assert.equal(finalState.rows[0].pedidos, 1);
  } finally {
    // Limpeza limitada aos identificadores sintéticos criados por este teste.
    if (sessaoId || mesaId) {
      const ids = await pool.query(
        "SELECT id FROM mesa_sessoes WHERE mesa_id = $1",
        [mesaId || -1]
      );
      for (const row of ids.rows) {
        await pool.query('DELETE FROM sessao_pagamentos WHERE sessao_id = $1', [row.id]);
        await pool.query('DELETE FROM pedidos WHERE sessao_id = $1', [row.id]);
      }
      await pool.query('DELETE FROM mesa_sessoes WHERE mesa_id = $1', [mesaId || -1]);
    }
    if (mesaId) await pool.query('DELETE FROM mesas WHERE id = $1', [mesaId]);
    if (produtoId) await pool.query('DELETE FROM produtos WHERE id = $1', [produtoId]);
    if (categoriaId) await pool.query('DELETE FROM categorias WHERE id = $1', [categoriaId]);
    await pool.end();
  }
});
