const test = require('node:test');
const assert = require('node:assert/strict');

assert.ok(process.env.DATABASE_URL, 'Este teste deve rodar apenas contra o PostgreSQL descartável do CI');

const pool = require('../db/pool');
const { assumirMesa, transferirMesa, listarPedidosProntosGarcom, resumoPagamentoSessao } = require('../db/atendimento');
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
      'SELECT garcom_anterior_id, garcom_novo_id, alterado_por_id FROM mesa_atendimento_historico WHERE sessao_id = $1 ORDER BY id DESC LIMIT 1',
      [ids.sessao]
    );
    assert.equal(Number(historico.rows[0].garcom_anterior_id), Number(ids.garcomA));
    assert.equal(Number(historico.rows[0].garcom_novo_id), Number(ids.garcomB));
    assert.equal(Number(historico.rows[0].alterado_por_id), Number(ids.garcomA));

    await assert.rejects(
      () => entregarComoGarcom(ids.pedido, tokenA, [ids.item]),
      (error) => error.status === 403
    );

    await entregarComoGarcom(ids.pedido, tokenB, [ids.item]);
    const finalItem = await pool.query('SELECT status FROM itens_pedido WHERE id = $1', [ids.item]);
    assert.equal(finalItem.rows[0].status, 'entregue');

    const resumo = await resumoPagamentoSessao(tokenB, ids.sessao);
    assert.equal(Number(resumo.valorTotal), 12);
    assert.equal(Number(resumo.valorPago), 0);
    assert.equal(Number(resumo.valorRestante), 12);
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
    if (mesaId) await pool.query('DELETE FROM mesas WHERE id=$1', [mesaId]).catch(() => {});
    if (garcomId) await pool.query('DELETE FROM garcons WHERE id=$1', [garcomId]).catch(() => {});
  }
});

test.after(async () => {
  await pool.end();
});
