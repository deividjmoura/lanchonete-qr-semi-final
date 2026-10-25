// Integração real com PostgreSQL. Executado apenas no job que provisiona o serviço descartável.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const pool = require('../db/pool');
const pedidos = require('../db/pedidos');
const caixa = require('../db/caixa');
const garcons = require('../db/garcons');

test('pedido idempotente, estoque, entrega parcial, pagamento e fechamento persistem invariantes', async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname),
    'Integração bloqueada: host deve ser o PostgreSQL descartável do CI');
  assert.equal(databaseUrl.pathname, '/qradmin_test',
    'Integração bloqueada: database deve ser qradmin_test; produção nunca é permitida');
  assert.equal(process.env.NODE_ENV, 'test', 'Integração exige NODE_ENV=test');

  // Confirma a versão do servidor real, não apenas a tag configurada no workflow.
  const versionResult = await pool.query('SHOW server_version');
  const serverVersion = String(versionResult.rows[0]?.server_version || '');
  assert.match(serverVersion, /^16(?:\.|$)/,
    'Integração exige PostgreSQL major 16 no servidor conectado');
  // Log de diagnóstico deliberadamente limitado a campos não secretos.
  console.log(`[postgres-integration] host=${databaseUrl.hostname} database=${databaseUrl.pathname.slice(1)} server_major=16`);

  const token = randomUUID();
  const tokenSecundario = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  let mesaId;
  let mesaSecundariaId;
  let categoriaId;
  let produtoId;
  let produtoExtraId;
  let sessaoId;
  let garcomId;

  try {
    const mesa = await pool.query(
      'INSERT INTO mesas (numero, token) VALUES ($1, $2) RETURNING id',
      [900000 + Math.floor(Math.random() * 90000), token]
    );
    mesaId = mesa.rows[0].id;
    const mesaSecundaria = await pool.query(
      'INSERT INTO mesas (numero, token) VALUES ($1, $2) RETURNING id',
      [990000 + Math.floor(Math.random() * 9000), tokenSecundario]
    );
    mesaSecundariaId = mesaSecundaria.rows[0].id;
    categoriaId = (await pool.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
      ['CI integração ' + suffix]
    )).rows[0].id;
    produtoId = (await pool.query(
      `INSERT INTO produtos
         (categoria_id, nome, preco, disponivel, controla_estoque, estoque)
       VALUES ($1, $2, 12.50, TRUE, TRUE, 5) RETURNING id`,
      [categoriaId, 'Produto com estoque CI ' + suffix]
    )).rows[0].id;
    produtoExtraId = (await pool.query(
      `INSERT INTO produtos (categoria_id, nome, preco, disponivel)
       VALUES ($1, $2, 5.00, TRUE) RETURNING id`,
      [categoriaId, 'Produto extra CI ' + suffix]
    )).rows[0].id;
    const garcom = await garcons.criarGarcom({ nome: 'Garçom CI ' + suffix });
    garcomId = garcom.id;

    const key = 'ci-' + randomUUID();
    const body = {
      idempotencyKey: key,
      items: [
        { productId: produtoId, qty: 2 },
        { productId: produtoExtraId, qty: 1 },
      ],
    };
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
      `SELECT id, produto_id, quantidade, preco_unitario, status
       FROM itens_pedido WHERE pedido_id = $1 ORDER BY id`,
      [first.id]
    );
    assert.equal(itemRows.rowCount, 2, 'retry não pode duplicar itens');
    assert.equal(itemRows.rows[0].produto_id, produtoId);
    assert.equal(itemRows.rows[0].quantidade, 2);
    assert.equal(Number(itemRows.rows[0].preco_unitario), 12.5);
    assert.equal(itemRows.rows[1].produto_id, produtoExtraId);
    assert.equal(itemRows.rows[1].quantidade, 1);
    assert.equal(Number(itemRows.rows[1].preco_unitario), 5);

    // O retry concorrente não pode baixar o estoque duas vezes.
    let stock = await pool.query(
      'SELECT estoque, disponivel FROM produtos WHERE id = $1',
      [produtoId]
    );
    assert.equal(stock.rows[0].estoque, 3, 'estoque deve baixar apenas 2 unidades para o pedido idempotente');
    assert.equal(stock.rows[0].disponivel, true);

    // Pedido acima do saldo deve falhar sem alterar estoque nem persistir outro pedido.
    await assert.rejects(
      () => pedidos.criarPedido(token, {
        idempotencyKey: 'ci-overstock-' + randomUUID(),
        items: [{ productId: produtoId, qty: 4 }],
      }),
      /Estoque insuficiente/
    );
    stock = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [produtoId]);
    assert.equal(stock.rows[0].estoque, 3, 'pedido recusado não pode alterar estoque');
    const orderCount = await pool.query(
      'SELECT COUNT(*)::int AS n FROM pedidos WHERE sessao_id = $1',
      [sessaoId]
    );
    assert.equal(orderCount.rows[0].n, 1, 'pedido recusado não pode deixar pedido parcial');

    // Cancelamento público restaura o estoque dentro da transação e remove o pedido.
    const pedidoParaCancelar = await pedidos.criarPedido(token, {
      idempotencyKey: 'ci-cancel-' + randomUUID(),
      items: [{ productId: produtoId, qty: 1 }],
    });
    stock = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [produtoId]);
    assert.equal(stock.rows[0].estoque, 2, 'pedido de cancelamento deve baixar uma unidade');

    // Rejeita token inválido, pedido pertencente a outra mesa, pedido em preparo
    // e sessão fechada sem remover pedido nem devolver estoque.
    await assert.rejects(
      () => pedidos.cancelarPedidoCliente('token-invalido', pedidoParaCancelar.id),
      /Mesa não encontrada/
    );
    await assert.rejects(
      () => pedidos.cancelarPedidoCliente(tokenSecundario, pedidoParaCancelar.id),
      /Pedido não encontrado nesta mesa/
    );

    await pool.query("UPDATE pedidos SET status = 'em_producao' WHERE id = $1", [pedidoParaCancelar.id]);
    await assert.rejects(
      () => pedidos.cancelarPedidoCliente(token, pedidoParaCancelar.id),
      /Só é possível cancelar enquanto o pedido ainda não entrou em preparo/
    );
    stock = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [produtoId]);
    assert.equal(stock.rows[0].estoque, 2, 'pedido em preparo não pode restaurar estoque');
    await pool.query("UPDATE pedidos SET status = 'recebido' WHERE id = $1", [pedidoParaCancelar.id]);

    await pool.query("UPDATE mesa_sessoes SET status = 'fechada' WHERE id = $1", [sessaoId]);
    await assert.rejects(
      () => pedidos.cancelarPedidoCliente(token, pedidoParaCancelar.id),
      /Pedido não encontrado nesta mesa/
    );
    stock = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [produtoId]);
    assert.equal(stock.rows[0].estoque, 2, 'sessão fechada não pode permitir cancelamento nem alterar estoque');
    await pool.query("UPDATE mesa_sessoes SET status = 'aberta' WHERE id = $1", [sessaoId]);

    const cancelamento = await pedidos.cancelarPedidoCliente(token, pedidoParaCancelar.id);
    assert.equal(cancelamento.cancelado, true);
    assert.equal(cancelamento.id, pedidoParaCancelar.id);
    const canceladoPersistido = await pool.query(
      'SELECT COUNT(*)::int AS n FROM pedidos WHERE id = $1', [pedidoParaCancelar.id]
    );
    assert.equal(canceladoPersistido.rows[0].n, 0, 'pedido cancelado deve ser removido');
    const itensCancelados = await pool.query(
      'SELECT COUNT(*)::int AS n FROM itens_pedido WHERE pedido_id = $1', [pedidoParaCancelar.id]
    );
    assert.equal(itensCancelados.rows[0].n, 0, 'itens do pedido cancelado devem ser removidos');
    stock = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [produtoId]);
    assert.equal(stock.rows[0].estoque, 3, 'cancelamento deve restaurar exatamente uma unidade');

    await assert.rejects(
      () => pedidos.cancelarPedidoCliente(token, pedidoParaCancelar.id),
      /Pedido não encontrado nesta mesa/
    );
    stock = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [produtoId]);
    assert.equal(stock.rows[0].estoque, 3, 'retry de cancelamento não pode restaurar estoque novamente');

    // Ambos ficam prontos, mas o garçom entrega somente um item de cada vez.
    await pedidos.setStatusItem(itemRows.rows[0].id, 'concluido');
    await pedidos.setStatusItem(itemRows.rows[1].id, 'concluido');
    const entregaParcial = await garcons.entregarComoGarcom(
      first.id, garcom.token, [itemRows.rows[0].id]
    );
    assert.equal(entregaParcial.parcial, true);
    assert.equal(entregaParcial.status, 'concluido');
    assert.equal(Number(entregaParcial.valorEntregue), 25);

    const partialState = await pool.query(
      `SELECT p.status AS pedido_status, ip.id, ip.status AS item_status,
              s.valor_total
       FROM pedidos p
       JOIN itens_pedido ip ON ip.pedido_id = p.id
       JOIN mesa_sessoes s ON s.id = p.sessao_id
       WHERE p.id = $1 ORDER BY ip.id`,
      [first.id]
    );
    assert.equal(partialState.rows[0].item_status, 'entregue');
    assert.equal(partialState.rows[1].item_status, 'concluido');
    assert.equal(partialState.rows[0].pedido_status, 'concluido');
    assert.equal(Number(partialState.rows[0].valor_total), 25,
      'total da sessão deve incluir somente o item já entregue');

    const entregaFinal = await garcons.entregarComoGarcom(
      first.id, garcom.token, [itemRows.rows[1].id]
    );
    assert.equal(entregaFinal.parcial, false);
    assert.equal(entregaFinal.status, 'entregue');
    assert.equal(Number(entregaFinal.valorEntregue), 5);

    const deliveredTotal = await pool.query(
      `SELECT SUM(ip.quantidade * ip.preco_unitario)::numeric(10,2) AS total
       FROM itens_pedido ip
       WHERE ip.pedido_id = $1 AND ip.status = 'entregue'`,
      [first.id]
    );
    assert.equal(Number(deliveredTotal.rows[0].total), 30);
    const totalSessao = await pool.query(
      'SELECT valor_total FROM mesa_sessoes WHERE id = $1',
      [sessaoId]
    );
    assert.equal(Number(totalSessao.rows[0].valor_total), 30,
      'total da sessão deve refletir todos e somente os itens entregues');

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
    assert.equal(closed.valorTotal, 30);
    assert.equal(closed.valorPago, 30);

    const finalState = await pool.query(
      `SELECT s.status, s.valor_total, s.valor_cobrado,
              (SELECT COUNT(*)::int FROM sessao_pagamentos p WHERE p.sessao_id = s.id) AS pagamentos,
              (SELECT COUNT(*)::int FROM pedidos p WHERE p.sessao_id = s.id) AS pedidos
       FROM mesa_sessoes s WHERE s.id = $1`,
      [sessaoId]
    );
    assert.equal(finalState.rows[0].status, 'fechada');
    assert.equal(Number(finalState.rows[0].valor_total), 30);
    assert.equal(Number(finalState.rows[0].valor_cobrado), 30);
    assert.equal(finalState.rows[0].pagamentos, 2, 'pagamento parcial + saldo do fechamento');
    assert.equal(finalState.rows[0].pedidos, 1);
  } finally {
    // Limpeza limitada aos identificadores sintéticos criados por este teste.
    if (mesaId) {
      const ids = await pool.query(
        'SELECT id FROM mesa_sessoes WHERE mesa_id = $1',
        [mesaId]
      );
      for (const row of ids.rows) {
        await pool.query('DELETE FROM sessao_pagamentos WHERE sessao_id = $1', [row.id]);
        await pool.query('DELETE FROM pedidos WHERE sessao_id = $1', [row.id]);
      }
      await pool.query('DELETE FROM mesa_sessoes WHERE mesa_id = $1', [mesaId]);
    }
    if (garcomId) await pool.query('DELETE FROM garcons WHERE id = $1', [garcomId]);
    if (mesaId) await pool.query('DELETE FROM mesas WHERE id = $1', [mesaId]);
    if (mesaSecundariaId) await pool.query('DELETE FROM mesas WHERE id = $1', [mesaSecundariaId]);
    if (produtoId) await pool.query('DELETE FROM produtos WHERE id = $1', [produtoId]);
    if (produtoExtraId) await pool.query('DELETE FROM produtos WHERE id = $1', [produtoExtraId]);
    if (categoriaId) await pool.query('DELETE FROM categorias WHERE id = $1', [categoriaId]);
    await pool.end();
  }
});
