const test = require('node:test');
const assert = require('node:assert/strict');

assert.ok(process.env.DATABASE_URL, 'Este teste deve rodar apenas contra o PostgreSQL descartável do CI');

const pool = require('../db/pool');
const { registrarPagamento, fecharSessao } = require('../db/caixa');

test('PostgreSQL real: pagamento parcial é idempotente e quitação registra o operador', async () => {
  const ids = { categoria: null, produto: null, mesa: null, sessao: null, pedido: null };
  const mesaNumero = 900 + (process.pid % 1000);
  const chaveParcial = '00000000-0000-4000-8000-000000000101';
  const chaveFechamento = '00000000-0000-4000-8000-000000000102';

  try {
    const categoria = await pool.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
      ['CI Financeiro ' + process.pid]
    );
    ids.categoria = categoria.rows[0].id;

    const produto = await pool.query(
      'INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel) VALUES ($1, $2, $3, $4, TRUE) RETURNING id',
      [ids.categoria, 'Item de integração ' + process.pid, 'Fixture temporária do CI', 10]
    );
    ids.produto = produto.rows[0].id;

    const mesa = await pool.query(
      "INSERT INTO mesas (numero, status) VALUES ($1, 'ocupada') RETURNING id",
      [mesaNumero]
    );
    ids.mesa = mesa.rows[0].id;

    const sessao = await pool.query(
      "INSERT INTO mesa_sessoes (mesa_id, status, cliente_nome, valor_total) VALUES ($1, 'aberta', 'Teste CI', 0) RETURNING id",
      [ids.mesa]
    );
    ids.sessao = sessao.rows[0].id;

    const pedido = await pool.query(
      "INSERT INTO pedidos (sessao_id, status, cliente_nome, observacao_geral) VALUES ($1, 'entregue', 'Teste CI', 'Fixture de integração') RETURNING id",
      [ids.sessao]
    );
    ids.pedido = pedido.rows[0].id;

    await pool.query(
      "INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, status) VALUES ($1, $2, 2, 10, 'entregue')",
      [ids.pedido, ids.produto]
    );

    const parcial = await registrarPagamento(ids.sessao, {
      valor: 10,
      formaPagamento: 'dinheiro',
      idempotencyKey: chaveParcial,
    }, 'QA PostgreSQL');

    assert.equal(parcial.valorTotal, 20);
    assert.equal(parcial.valorPago, 10);
    assert.equal(parcial.valorRestante, 10);
    assert.equal(parcial.pagamento.operadorNome, 'QA PostgreSQL');
    assert.equal(parcial.idempotentReplay, false);

    const replay = await registrarPagamento(ids.sessao, {
      valor: 10,
      formaPagamento: 'dinheiro',
      idempotencyKey: chaveParcial,
    }, 'QA PostgreSQL');
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.pagamento.id, parcial.pagamento.id);

    await assert.rejects(
      () => registrarPagamento(ids.sessao, {
        valor: 11,
        formaPagamento: 'pix',
        idempotencyKey: '00000000-0000-4000-8000-000000000103',
      }, 'QA PostgreSQL', ids.garcomAutorizado),
      (error) => error.status === 400
    );

    const fechamentoBody = {
      formaPagamento: 'pix',
      desconto: 0,
      taxaServico: 0,
      idempotencyKey: chaveFechamento,
    };
    const fechado = await fecharSessao(ids.sessao, fechamentoBody, 'QA PostgreSQL');
    assert.equal(fechado.status, 'fechada');
    assert.equal(fechado.valorTotal, 20);
    assert.equal(fechado.valorCobrado, 20);
    assert.equal(fechado.valorPago, 20);
    assert.equal(fechado.idempotentReplay, false);

    const fechamentoReplay = await fecharSessao(ids.sessao, fechamentoBody, 'QA PostgreSQL');
    assert.equal(fechamentoReplay.status, 'fechada');
    assert.equal(fechamentoReplay.idempotentReplay, true);
    assert.equal(fechamentoReplay.valorPago, 20);

    const pagamentos = await pool.query(
      'SELECT valor, forma_pagamento, operador_nome FROM sessao_pagamentos WHERE sessao_id = $1 ORDER BY id',
      [ids.sessao]
    );
    assert.equal(pagamentos.rows.length, 2);
    assert.deepEqual(pagamentos.rows.map((row) => Number(row.valor)), [10, 10]);
    assert.equal(pagamentos.rows[0].operador_nome, 'QA PostgreSQL');
    assert.equal(pagamentos.rows[1].operador_nome, 'QA PostgreSQL');

    const mesaFinal = await pool.query('SELECT status FROM mesas WHERE id = $1', [ids.mesa]);
    assert.equal(mesaFinal.rows[0].status, 'livre');
  } finally {
    if (ids.pedido) await pool.query('DELETE FROM itens_pedido WHERE pedido_id = $1', [ids.pedido]).catch(() => {});
    if (ids.pedido) await pool.query('DELETE FROM pedidos WHERE id = $1', [ids.pedido]).catch(() => {});
    if (ids.sessao) await pool.query('DELETE FROM mesa_sessoes WHERE id = $1', [ids.sessao]).catch(() => {});
    if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id = $1', [ids.mesa]).catch(() => {});
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id = $1', [ids.produto]).catch(() => {});
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id = $1', [ids.categoria]).catch(() => {});
  }
});

test.after(async () => {
  await pool.end();
});
