// Produção parcial por item: começar/liberar UM item não mexe nos outros.
// Cobre o aceite do PR 2:
//   * comanda com 3 itens em estados diferentes no banco;
//   * cada item aparece na sua etapa (em produção / na fila);
//   * item liberado chega na hora para o garçom;
//   * a fila do setor não mostra mais "prontos", mas continua escondendo o
//     pedido só quando não resta nenhum item daquele setor para produzir.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Este teste roda apenas contra o PostgreSQL descartável do CI');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/qradmin_test', 'banco de teste obrigatório');

const pool = require('../db/pool');
const { setStatusItem, getFilaCozinha, getFilaBar, getFilaGarcom } = require('../db/pedidos');

test.after(async () => {
  await pool.end();
});

async function cenario() {
  const sufixo = randomUUID().slice(0, 8);
  const categoria = (await pool.query(
    'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
    ['CI Parcial ' + sufixo]
  )).rows[0].id;
  const criarProduto = async (nome, setor, preco) => {
    const r = await pool.query(
      `INSERT INTO produtos (categoria_id, nome, preco, disponivel, setor)
       VALUES ($1, $2, $3, TRUE, $4) RETURNING id`,
      [categoria, nome + ' ' + sufixo, preco, setor]
    );
    return r.rows[0].id;
  };
  const paes = await criarProduto('Burger', 'cozinha', 20);
  const fritas = await criarProduto('Fritas', 'cozinha', 15);
  const suco = await criarProduto('Suco', 'bar', 10);
  const garcom = (await pool.query(
    'INSERT INTO garcons (nome, token, ativo) VALUES ($1, $2, TRUE) RETURNING id, nome, token',
    ['Garçom Parcial ' + sufixo, randomUUID()]
  )).rows[0];

  // Reaproveita uma mesa sem sessão aberta (o banco local pode já ter todas ocupadas).
  const disponivel = (await pool.query(
    `SELECT m.id, m.numero FROM mesas m
      WHERE NOT EXISTS (
        SELECT 1 FROM mesa_sessoes s WHERE s.mesa_id = m.id AND s.status = 'aberta'
      )
      ORDER BY m.numero DESC LIMIT 1`
  )).rows[0];
  let mesa;
  let mesaCriada = false;
  if (disponivel) {
    mesa = disponivel;
    await pool.query("UPDATE mesas SET status='ocupada' WHERE id=$1", [mesa.id]);
  } else {
    mesa = (await pool.query(
      "INSERT INTO mesas (numero, status) VALUES (70, 'ocupada') RETURNING id, numero"
    )).rows[0];
    mesaCriada = true;
  }

  const sessao = (await pool.query(
    `INSERT INTO mesa_sessoes (mesa_id, status, cliente_nome, valor_total, garcom_responsavel_id)
     VALUES ($1, 'aberta', $2, 0, $3) RETURNING id`,
    [mesa.id, 'Cliente parcial ' + sufixo, garcom.id]
  )).rows[0];
  const pedido = (await pool.query(
    "INSERT INTO pedidos (sessao_id, status, origem_pedido) VALUES ($1, 'recebido', 'cliente') RETURNING id",
    [sessao.id]
  )).rows[0];

  const item = async (produtoId, preco, setor) => {
    const r = await pool.query(
      `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, status, setor)
       VALUES ($1, $2, 1, $3, 'recebido', $4) RETURNING id`,
      [pedido.id, produtoId, preco, setor]
    );
    return r.rows[0].id;
  };
  const itens = {
    burger: await item(paes, 20, 'cozinha'),
    fritas: await item(fritas, 15, 'cozinha'),
    acompanhamento: await item(fritas, 15, 'cozinha'),
    suco: await item(suco, 10, 'bar'),
  };

  return {
    sessaoId: sessao.id,
    mesaId: mesa.id,
    mesaCriada,
    pedidoId: pedido.id,
    garcom,
    produtos: [paes, fritas, suco],
    categoria,
    itens,
  };
}

async function limpar(c) {
  try {
    await pool.query('DELETE FROM sessao_pagamentos WHERE sessao_id=$1', [c.sessaoId]);
    await pool.query('DELETE FROM itens_pedido WHERE pedido_id=$1', [c.pedidoId]);
    await pool.query('DELETE FROM pedidos WHERE id=$1', [c.pedidoId]);
    await pool.query('DELETE FROM mesa_sessoes WHERE id=$1', [c.sessaoId]);
    if (c.mesaCriada) await pool.query('DELETE FROM mesas WHERE id=$1', [c.mesaId]);
    else await pool.query("UPDATE mesas SET status='livre' WHERE id=$1", [c.mesaId]);
    await pool.query('DELETE FROM garcons WHERE id=$1', [c.garcom.id]);
    await pool.query('DELETE FROM produtos WHERE id=ANY($1::int[])', [c.produtos]);
    await pool.query('DELETE FROM categorias WHERE id=$1', [c.categoria]);
  } catch (e) {
    console.error('[limpeza parcial]', e.message);
  }
}

const statusItens = async (pedidoId) =>
  Object.fromEntries(
    (await pool.query('SELECT id, status FROM itens_pedido WHERE pedido_id=$1', [pedidoId])).rows.map(
      (r) => [Number(r.id), r.status]
    )
  );

const statusPedido = async (pedidoId) =>
  (await pool.query('SELECT status FROM pedidos WHERE id=$1', [pedidoId])).rows[0].status;

const achar = (lista, pedidoId) => lista.find((p) => Number(p.id) === Number(pedidoId));

test('começar um item não move os outros e a comanda convive em duas etapas', async () => {
  const c = await cenario();
  try {
    await setStatusItem(c.itens.burger, 'em_producao', 'cozinha');

    const depois = await statusItens(c.pedidoId);
    assert.equal(depois[c.itens.burger], 'em_producao', 'só o item clicado avançou');
    assert.equal(depois[c.itens.fritas], 'recebido', 'os outros continuam na fila');
    assert.equal(depois[c.itens.acompanhamento], 'recebido');
    assert.equal(depois[c.itens.suco], 'recebido', 'o bar não é afetado pela cozinha');
    assert.equal(await statusPedido(c.pedidoId), 'em_producao', 'a comanda reflete o item iniciado');

    const cozinha = await getFilaCozinha();
    const daCozinha = achar(cozinha, c.pedidoId);
    assert.ok(daCozinha, 'a comanda continua na fila da cozinha enquanto houver item pendente');
    const porId = new Map(daCozinha.itens.map((i) => [Number(i.id), i]));
    assert.equal(porId.get(c.itens.burger).status, 'em_producao');
    assert.equal(porId.get(c.itens.fritas).status, 'recebido');
    assert.equal(porId.get(c.itens.suco), undefined, 'a fila da cozinha não carrega itens do bar');

    const filaGarcom = await getFilaGarcom(c.garcom.id);
    assert.equal(achar(filaGarcom, c.pedidoId), undefined, 'nada pronto: garçom ainda não vê a comanda');
  } finally {
    await limpar(c);
  }
});

test('liberar um item o entrega ao garçom sem esperar os outros dois', async () => {
  const c = await cenario();
  try {
    await setStatusItem(c.itens.burger, 'em_producao', 'cozinha');
    await setStatusItem(c.itens.burger, 'concluido', 'cozinha');

    const garcom = await getFilaGarcom(c.garcom.id);
    const comanda = achar(garcom, c.pedidoId);
    assert.ok(comanda, 'item pronto aparece imediatamente para o garçom');
    assert.equal(comanda.itensProntos, 1);
    assert.equal(
      comanda.itens.filter((i) => i.status === 'concluido').length,
      1,
      'só o item liberado está pronto'
    );
    assert.ok(
      comanda.itens.filter((i) => i.status === 'concluido').some((i) => Number(i.id) === c.itens.burger),
      'o pronto é exatamente o item liberado'
    );

    const depois = await statusItens(c.pedidoId);
    assert.equal(depois[c.itens.fritas], 'recebido');
    assert.equal(depois[c.itens.acompanhamento], 'recebido');
    assert.equal(await statusPedido(c.pedidoId), 'em_producao');

    const daCozinha = achar(await getFilaCozinha(), c.pedidoId);
    assert.ok(daCozinha, 'a cozinha segue com os dois itens que faltam');
    assert.equal(daCozinha.itens.filter((i) => ['recebido', 'em_producao'].includes(i.status)).length, 2);
  } finally {
    await limpar(c);
  }
});

test('sem "prontos": a comanda sai da fila do setor com tudo liberado, mas fica com o garçom', async () => {
  const c = await cenario();
  try {
    for (const id of [c.itens.burger, c.itens.fritas, c.itens.acompanhamento]) {
      await setStatusItem(id, 'em_producao', 'cozinha');
      await setStatusItem(id, 'concluido', 'cozinha');
    }

    assert.equal(achar(await getFilaCozinha(), c.pedidoId), undefined, 'cozinha não mantém coluna de prontos');
    const bar = achar(await getFilaBar(), c.pedidoId);
    assert.ok(bar, 'o bar continua vendo o item dele');
    assert.equal(bar.itens.length, 1);
    assert.equal(bar.itens[0].status, 'recebido');

    const garcom = achar(await getFilaGarcom(c.garcom.id), c.pedidoId);
    assert.equal(garcom.itensProntos, 3, 'os três itens da cozinha chegaram ao garçom');
    assert.equal(await statusPedido(c.pedidoId), 'em_producao', 'o bar ainda pendente segura a comanda');

    await setStatusItem(c.itens.suco, 'em_producao', 'bar');
    await setStatusItem(c.itens.suco, 'concluido', 'bar');
    assert.equal(await statusPedido(c.pedidoId), 'concluido');
    assert.equal(achar(await getFilaBar(), c.pedidoId), undefined);
    assert.equal(achar(await getFilaGarcom(c.garcom.id), c.pedidoId).itensProntos, 4);
  } finally {
    await limpar(c);
  }
});

test('item concluído não volta para produção: a etapa só avança', async () => {
  const c = await cenario();
  try {
    await setStatusItem(c.itens.fritas, 'em_producao', 'cozinha');
    await setStatusItem(c.itens.fritas, 'concluido', 'cozinha');
    await assert.rejects(
      () => setStatusItem(c.itens.fritas, 'em_producao', 'cozinha'),
      (e) => e.status === 409 && /não pode ir para/.test(e.message)
    );
    assert.equal((await statusItens(c.pedidoId))[c.itens.fritas], 'concluido');
  } finally {
    await limpar(c);
  }
});

test('o setor não consegue mover item do outro setor', async () => {
  const c = await cenario();
  try {
    await assert.rejects(
      () => setStatusItem(c.itens.suco, 'em_producao', 'cozinha'),
      (e) => e.status === 403 && /setor/.test(e.message)
    );
    assert.equal((await statusItens(c.pedidoId))[c.itens.suco], 'recebido');
  } finally {
    await limpar(c);
  }
});
