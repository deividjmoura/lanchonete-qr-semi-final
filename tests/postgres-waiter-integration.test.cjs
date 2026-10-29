const test = require('node:test');
const assert = require('node:assert/strict');

assert.ok(process.env.DATABASE_URL, 'Este teste deve rodar apenas contra o PostgreSQL descartável do CI');
// Trava de segurança: o teste insere fixtures; nunca rodar contra produção.
assert.strictEqual(
  new URL(process.env.DATABASE_URL).pathname,
  '/qradmin_test',
  'Integração bloqueada: database deve ser qradmin_test; produção nunca é permitida'
);

const pool = require('../db/pool');
const { assumirMesa, transferirMesa, criarPedidoGarcom, listarAtendimentosGarcom, listarPedidosProntosGarcom, resumoPagamentoSessao } = require('../db/atendimento');
const { registrarPagamento } = require('../db/caixa');
const { entregarComoGarcom } = require('../db/garcons');

test('PostgreSQL real: fila acompanha a transferência e só o novo responsável pode entregar', async () => {
  const ids = { categoria: null, produto: null, garcomA: null, garcomB: null, mesa: null, sessao: null, pedido: null, item: null };
  const mesaNumero = 6;
  const tokenA = '00000000-0000-4000-8000-000000000201';
  const tokenB = '00000000-0000-4000-8000-000000000202';

  try {
    const categoria = await pool.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
      ['CI Garçom ' + process.pid]
    );
    ids.categoria = categoria.rows[0].id;

    const produto = await pool.query(
      'INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel) VALUES ($1, $2, $3, $4, TRUE) RETURNING id',
      [ids.categoria, 'Item pronto ' + process.pid, 'Fixture temporária do CI', 12]
    );
    ids.produto = produto.rows[0].id;

    const a = await pool.query(
      'INSERT INTO garcons (nome, token, ativo) VALUES ($1, $2, TRUE) RETURNING id',
      ['Garçom A CI ' + process.pid, tokenA]
    );
    ids.garcomA = a.rows[0].id;
    const b = await pool.query(
      'INSERT INTO garcons (nome, token, ativo) VALUES ($1, $2, TRUE) RETURNING id',
      ['Garçom B CI ' + process.pid, tokenB]
    );
    ids.garcomB = b.rows[0].id;

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

    // O início de atendimento só é permitido quando já existe pedido QR de cliente.
    const pedido = await pool.query(
      "INSERT INTO pedidos (sessao_id, status, cliente_nome, observacao_geral, origem_pedido) VALUES ($1, 'concluido', 'Teste CI', 'Fixture de transferência', 'cliente') RETURNING id",
      [ids.sessao]
    );
    ids.pedido = pedido.rows[0].id;

    const inicio = await assumirMesa(tokenA, mesaNumero, { clienteNome: 'Teste CI' });
    assert.equal(Number(inicio.garcom.id), Number(ids.garcomA));
    const item = await pool.query(
      "INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, status) VALUES ($1, $2, 1, 12, 'concluido') RETURNING id",
      [ids.pedido, ids.produto]
    );
    ids.item = item.rows[0].id;

    const filaA = await listarPedidosProntosGarcom(tokenA);
    assert.ok(filaA.some((row) => Number(row.id) === Number(ids.pedido)));

    const transfer = await transferirMesa(tokenA, mesaNumero, ids.garcomB);
    assert.equal(transfer.transferida, true);
    assert.equal(Number(transfer.de.id), Number(ids.garcomA));
    assert.equal(Number(transfer.para.id), Number(ids.garcomB));

    const [filaDepoisA, filaDepoisB] = await Promise.all([
      listarPedidosProntosGarcom(tokenA),
      listarPedidosProntosGarcom(tokenB),
    ]);
    assert.equal(filaDepoisA.some((row) => Number(row.id) === Number(ids.pedido)), false);
    assert.ok(filaDepoisB.some((row) => Number(row.id) === Number(ids.pedido)));

    const historico = await pool.query(
      'SELECT garcom_anterior_id, garcom_novo_id, alterado_por_id, alterado_em FROM mesa_atendimento_historico WHERE sessao_id = $1 ORDER BY id DESC LIMIT 1',
      [ids.sessao]
    );
    assert.equal(Number(historico.rows[0].garcom_anterior_id), Number(ids.garcomA));
    assert.equal(Number(historico.rows[0].garcom_novo_id), Number(ids.garcomB));
    assert.equal(Number(historico.rows[0].alterado_por_id), Number(ids.garcomA));
    assert.ok(historico.rows[0].alterado_em, 'transferência deve registrar o horário da alteração');

    const pedidoMantido = await pool.query(
      'SELECT status FROM pedidos WHERE id=$1',
      [ids.pedido]
    );
    assert.equal(pedidoMantido.rows[0].status, 'concluido', 'transferência não deve alterar o status do pedido pronto');

    await assert.rejects(
      () => entregarComoGarcom(ids.pedido, tokenA, [ids.item]),
      (error) => error.status === 403
    );

    await entregarComoGarcom(ids.pedido, tokenB, [ids.item]);
    const finalItem = await pool.query('SELECT status FROM itens_pedido WHERE id = $1', [ids.item]);
    assert.equal(finalItem.rows[0].status, 'entregue');

    const paymentBody = {
      valor: 1,
      formaPagamento: 'pix',
      idempotencyKey: '00000000-0000-4000-8000-000000000204',
    };
    await assert.rejects(
      () => registrarPagamento(ids.sessao, paymentBody, 'Garçom A CI ' + process.pid, ids.garcomA),
      (error) => error.status === 403
    );
    const deniedPayment = await pool.query('SELECT COUNT(*)::int AS n FROM sessao_pagamentos WHERE sessao_id=$1', [ids.sessao]);
    assert.equal(deniedPayment.rows[0].n, 0, 'responsável anterior não deve lançar pagamento');

    const acceptedPayment = await registrarPagamento(ids.sessao, paymentBody, 'Garçom B CI ' + process.pid, ids.garcomB);
    assert.equal(acceptedPayment.idempotentReplay, false);
    assert.equal(acceptedPayment.pagamento.operadorNome, 'Garçom B CI ' + process.pid);
    const paymentReplay = await registrarPagamento(ids.sessao, paymentBody, 'Garçom B CI ' + process.pid, ids.garcomB);
    assert.equal(paymentReplay.idempotentReplay, true);
    assert.equal(paymentReplay.pagamento.id, acceptedPayment.pagamento.id);

    const resumo = await resumoPagamentoSessao(tokenB, ids.sessao);
    assert.equal(Number(resumo.valorTotal), 12);
    assert.equal(Number(resumo.valorPago), 1);
    assert.equal(Number(resumo.valorRestante), 11);
    await assert.rejects(
      () => resumoPagamentoSessao(tokenA, ids.sessao),
      (error) => error.status === 403
    );

    const aindaExiste = await pool.query('SELECT COUNT(*)::int AS n FROM pedidos WHERE sessao_id = $1', [ids.sessao]);
    assert.equal(aindaExiste.rows[0].n, 1);
  } finally {
    if (ids.item) await pool.query('DELETE FROM itens_pedido WHERE id = $1', [ids.item]).catch(() => {});
    if (ids.pedido) await pool.query('DELETE FROM pedidos WHERE id = $1', [ids.pedido]).catch(() => {});
    if (ids.sessao) await pool.query('DELETE FROM mesa_sessoes WHERE id = $1', [ids.sessao]).catch(() => {});
    if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id = $1', [ids.mesa]).catch(() => {});
    if (ids.garcomA) await pool.query('DELETE FROM garcons WHERE id = $1', [ids.garcomA]).catch(() => {});
    if (ids.garcomB) await pool.query('DELETE FROM garcons WHERE id = $1', [ids.garcomB]).catch(() => {});
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id = $1', [ids.produto]).catch(() => {});
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id = $1', [ids.categoria]).catch(() => {});
  }
});

test('PostgreSQL real: outro garçom pode acrescentar pedido sem tomar a responsabilidade da mesa', async () => {
  const ids = { categoria: null, produto: null, garcomA: null, garcomB: null, mesa: null, sessao: null };
  const mesaNumero = 8;
  const tokenA = '00000000-0000-4000-8000-000000000211';
  const tokenB = '00000000-0000-4000-8000-000000000212';

  try {
    ids.categoria = (await pool.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
      ['CI pedido cruzado ' + process.pid]
    )).rows[0].id;
    ids.produto = (await pool.query(
      'INSERT INTO produtos (categoria_id, nome, preco, disponivel) VALUES ($1, $2, 8.5, TRUE) RETURNING id',
      [ids.categoria, 'Produto pedido cruzado ' + process.pid]
    )).rows[0].id;
    ids.garcomA = (await pool.query(
      'INSERT INTO garcons (nome, token, ativo) VALUES ($1, $2, TRUE) RETURNING id',
      ['Responsável CI ' + process.pid, tokenA]
    )).rows[0].id;
    ids.garcomB = (await pool.query(
      'INSERT INTO garcons (nome, token, ativo) VALUES ($1, $2, TRUE) RETURNING id',
      ['Apoio CI ' + process.pid, tokenB]
    )).rows[0].id;
    ids.mesa = (await pool.query(
      "INSERT INTO mesas (numero, status) VALUES ($1, 'ocupada') RETURNING id",
      [mesaNumero]
    )).rows[0].id;
    ids.sessao = (await pool.query(
      "INSERT INTO mesa_sessoes (mesa_id, status, cliente_nome, valor_total) VALUES ($1, 'aberta', 'Teste cruzado', 0) RETURNING id",
      [ids.mesa]
    )).rows[0].id;
    await pool.query(
      "INSERT INTO pedidos (sessao_id, status, cliente_nome, observacao_geral, origem_pedido) VALUES ($1, 'recebido', 'Teste cruzado', 'Pedido QR inicial', 'cliente')",
      [ids.sessao]
    );

    await assumirMesa(tokenA, mesaNumero, { clienteNome: 'Teste cruzado' });
    const pedidoNovo = await criarPedidoGarcom(tokenB, mesaNumero, {
      idempotencyKey: '00000000-0000-4000-8000-000000000213',
      clienteNome: 'Teste cruzado',
      items: [{ productId: ids.produto, qty: 1 }],
    });

    const sessaoAtual = await pool.query(
      'SELECT garcom_responsavel_id FROM mesa_sessoes WHERE id=$1',
      [ids.sessao]
    );
    assert.equal(Number(sessaoAtual.rows[0].garcom_responsavel_id), Number(ids.garcomA),
      'acrescentar pedido não pode transferir a responsabilidade');
    const pedidosResponsavel = await listarAtendimentosGarcom(tokenA);
    const pedidosOutroGarcom = await listarAtendimentosGarcom(tokenB);
    assert.ok(pedidosResponsavel.some((p) => Number(p.id) === Number(pedidoNovo.id)),
      'o pedido adicional deve permanecer no atendimento do responsável atual');
    assert.equal(pedidosOutroGarcom.some((p) => Number(p.id) === Number(pedidoNovo.id)), false,
      'o pedido adicional não deve mover a mesa para quem o lançou');
  } finally {
    if (ids.sessao) {
      await pool.query(
        'DELETE FROM itens_pedido_adicionais WHERE item_pedido_id IN (SELECT id FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id=$1))',
        [ids.sessao]
      ).catch(() => {});
      await pool.query(
        'DELETE FROM itens_pedido_remocoes WHERE item_pedido_id IN (SELECT id FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id=$1))',
        [ids.sessao]
      ).catch(() => {});
      await pool.query(
        'DELETE FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id=$1)',
        [ids.sessao]
      ).catch(() => {});
      await pool.query('DELETE FROM pedidos WHERE sessao_id=$1', [ids.sessao]).catch(() => {});
      await pool.query('DELETE FROM mesa_atendimento_historico WHERE sessao_id=$1', [ids.sessao]).catch(() => {});
      await pool.query('DELETE FROM mesa_sessoes WHERE id=$1', [ids.sessao]).catch(() => {});
    }
    if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id=$1', [ids.mesa]).catch(() => {});
    if (ids.garcomA) await pool.query('DELETE FROM garcons WHERE id=$1', [ids.garcomA]).catch(() => {});
    if (ids.garcomB) await pool.query('DELETE FROM garcons WHERE id=$1', [ids.garcomB]).catch(() => {});
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id=$1', [ids.produto]).catch(() => {});
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id=$1', [ids.categoria]).catch(() => {});
  }
});

test('PostgreSQL real: mesa sem pedido QR é rejeitada sem criar sessão nem histórico', async () => {
  const mesaNumero = 7;
  const token = '00000000-0000-4000-8000-000000000203';
  let garcomId = null;
  let mesaId = null;

  try {
    const garcom = await pool.query(
      'INSERT INTO garcons (nome, token, ativo) VALUES ($1, $2, TRUE) RETURNING id',
      ['Garçom sem pedido CI ' + process.pid, token]
    );
    garcomId = garcom.rows[0].id;

    const mesa = await pool.query(
      "INSERT INTO mesas (numero, status) VALUES ($1, 'livre') RETURNING id",
      [mesaNumero]
    );
    mesaId = mesa.rows[0].id;

    await assert.rejects(
      () => assumirMesa(token, mesaNumero, { clienteNome: 'Não deve criar sessão' }),
      (error) => error.status === 409
    );

    const sessoes = await pool.query(
      'SELECT id FROM mesa_sessoes WHERE mesa_id=$1',
      [mesaId]
    );
    assert.equal(sessoes.rows.length, 0, 'mesa vazia não deve ganhar sessão por tentativa de assumir');
    const historico = await pool.query(
      `SELECT h.id
         FROM mesa_atendimento_historico h
         JOIN mesa_sessoes s ON s.id=h.sessao_id
        WHERE s.mesa_id=$1`,
      [mesaId]
    );
    assert.equal(historico.rows.length, 0, 'tentativa rejeitada não deve registrar atribuição');
  } finally {
    if (mesaId) {
      await pool.query(
        'DELETE FROM mesa_atendimento_historico WHERE sessao_id IN (SELECT id FROM mesa_sessoes WHERE mesa_id=$1)',
        [mesaId]
      ).catch(() => {});
      await pool.query('DELETE FROM mesa_sessoes WHERE mesa_id=$1', [mesaId]).catch(() => {});
      await pool.query('DELETE FROM mesas WHERE id=$1', [mesaId]).catch(() => {});
    }
    if (garcomId) await pool.query('DELETE FROM garcons WHERE id=$1', [garcomId]).catch(() => {});
  }
});

test.after(async () => {
  await pool.end();
});
