// O garçom cobra o mesmo valor que o caixa fecharia: consumo entregue +
// serviço padrão (10%). Antes, o resumo na PWA trazia só o consumo e o
// pagamento quitava a conta sem nunca cobrar nem registrar a taxa.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Este teste roda apenas contra o PostgreSQL descartável do CI');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/qradmin_test', 'banco de teste obrigatório');

const pool = require('../db/pool');
const { resumoPagamentoSessao } = require('../db/atendimento');
const { registrarPagamento } = require('../db/caixa');

const CHAVE = () => randomUUID();

// Fecha o pool ao final para o processo do node:test terminar na hora.
test.after(async () => {
  await pool.end();
});

async function cenario({ preco = 50, quantidade = 1, entregue = true } = {}) {
  const sufixo = randomUUID().slice(0, 8);
  const categoria = (await pool.query(
    'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
    ['CI Serviço ' + sufixo]
  )).rows[0].id;
  const produto = (await pool.query(
    'INSERT INTO produtos (categoria_id, nome, preco, disponivel) VALUES ($1, $2, $3, TRUE) RETURNING id',
    [categoria, 'Item serviço ' + sufixo, preco]
  )).rows[0].id;
  const garcom = (await pool.query(
    'INSERT INTO garcons (nome, token, ativo) VALUES ($1, $2, TRUE) RETURNING id, token',
    ['Garçom Serviço ' + sufixo, randomUUID()]
  )).rows[0];
  // Reaproveita uma mesa sem sessão aberta; só cria (e depois remove) se o
  // banco descartável ainda não tiver nenhuma livre.
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
    const numero = 70;
    mesa = (await pool.query(
      'INSERT INTO mesas (numero, status) VALUES ($1, $2) RETURNING id, numero',
      [numero, 'ocupada']
    )).rows[0];
    mesaCriada = true;
  }
  const sessao = (await pool.query(
    `INSERT INTO mesa_sessoes (mesa_id, status, cliente_nome, valor_total, garcom_responsavel_id)
     VALUES ($1, 'aberta', $2, 0, $3) RETURNING id`,
    [mesa.id, 'Cliente serviço ' + sufixo, garcom.id]
  )).rows[0];
  const pedido = (await pool.query(
    "INSERT INTO pedidos (sessao_id, status, origem_pedido) VALUES ($1, $2, 'cliente') RETURNING id",
    [sessao.id, entregue ? 'entregue' : 'em_producao']
  )).rows[0];
  await pool.query(
    `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, status, setor)
     VALUES ($1, $2, $3, $4, $5, 'cozinha')`,
    [pedido.id, produto, quantidade, preco, entregue ? 'entregue' : 'em_producao']
  );
  return {
    sessaoId: sessao.id,
    mesaId: mesa.id,
    mesaCriada,
    pedidoId: pedido.id,
    garcom,
    categoria,
    produto,
    sufixo,
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
    await pool.query('DELETE FROM produtos WHERE id=$1', [c.produto]);
    await pool.query('DELETE FROM categorias WHERE id=$1', [c.categoria]);
  } catch (e) {
    console.error('[limpeza serviço]', e.message);
  }
}

test('resumo do garçom traz consumo + serviço e o pagamento quita com a taxa registrada', async () => {
  const c = await cenario({ preco: 50 });
  try {
    const resumo = await resumoPagamentoSessao(c.garcom.token, c.sessaoId);
    assert.equal(resumo.valorTotal, 50, 'consumo entregue');
    assert.equal(resumo.valorPago, 0);
    assert.equal(resumo.taxaServicoPercentual, 10);
    assert.equal(resumo.taxaServico, 5, 'serviço padrão de 10%');
    assert.equal(resumo.valorTotalComServico, 55);
    assert.equal(resumo.valorRestante, 50, 'campo legado preservado');
    assert.equal(resumo.valorRestanteComServico, 55);

    // Sem incluir o serviço o teto continua sendo o consumo (compatibilidade
    // com PWA em cache antigo): 55 é recusado, 50 passa.
    await assert.rejects(
      () => registrarPagamento(c.sessaoId, { valor: 55, formaPagamento: 'pix', idempotencyKey: CHAVE() }, c.garcom.nome, c.garcom.id),
      (e) => e.status === 400 && /restante/.test(e.message)
    );

    const pago = await registrarPagamento(
      c.sessaoId,
      { valor: 55, formaPagamento: 'pix', idempotencyKey: CHAVE() },
      c.garcom.nome,
      c.garcom.id,
      { atorTipo: 'garcom', atorId: c.garcom.id, incluirServico: true }
    );
    assert.equal(pago.valorPago, 55);
    assert.equal(pago.valorRestante, 0);
    assert.equal(pago.taxaServico, 5);
    assert.equal(pago.valorCobrado, 55);
    assert.equal(pago.sessaoFechada, true, 'quitação com serviço encerra a conta');

    const fechada = (await pool.query(
      'SELECT status, valor_total, taxa_servico, valor_cobrado FROM mesa_sessoes WHERE id=$1',
      [c.sessaoId]
    )).rows[0];
    assert.equal(fechada.status, 'fechada');
    assert.equal(Number(fechada.valor_total), 50, 'valor_total continua sendo o consumo');
    assert.equal(Number(fechada.taxa_servico), 5, 'serviço registrado no fechamento');
    assert.equal(Number(fechada.valor_cobrado), 55, 'cobrado inclui o serviço');

    const evento = (await pool.query(
      "SELECT contexto FROM auditoria_eventos WHERE acao='sessao_fechada' AND alvo_id=$1 ORDER BY id DESC LIMIT 1",
      [String(c.sessaoId)]
    )).rows[0];
    assert.equal(Number(evento.contexto.taxaServico), 5);
    assert.equal(Number(evento.contexto.valorCobrado), 55);
    assert.equal(evento.contexto.origem, 'pagamento_integral');
  } finally {
    await limpar(c);
  }
});

test('recebimentos parciais somam até o total com serviço; o último quita', async () => {
  const c = await cenario({ preco: 40 });
  try {
    const primeiro = await registrarPagamento(
      c.sessaoId,
      { valor: 20, formaPagamento: 'dinheiro', idempotencyKey: CHAVE() },
      c.garcom.nome,
      c.garcom.id,
      { atorTipo: 'garcom', atorId: c.garcom.id, incluirServico: true }
    );
    assert.equal(primeiro.sessaoFechada, false);
    assert.equal(primeiro.valorRestante, 24, 'consumo 40 + serviço 4 = 44; faltam 24');

    const resumo = await resumoPagamentoSessao(c.garcom.token, c.sessaoId);
    assert.equal(resumo.valorPago, 20);
    assert.equal(resumo.valorRestanteComServico, 24);

    const segundo = await registrarPagamento(
      c.sessaoId,
      { valor: 24, formaPagamento: 'pix', idempotencyKey: CHAVE() },
      c.garcom.nome,
      c.garcom.id,
      { atorTipo: 'garcom', atorId: c.garcom.id, incluirServico: true }
    );
    assert.equal(segundo.sessaoFechada, true);
    assert.equal(segundo.valorPago, 44);
    const fechada = (await pool.query(
      'SELECT taxa_servico, valor_cobrado FROM mesa_sessoes WHERE id=$1',
      [c.sessaoId]
    )).rows[0];
    assert.equal(Number(fechada.taxa_servico), 4);
    assert.equal(Number(fechada.valor_cobrado), 44);
  } finally {
    await limpar(c);
  }
});

test('serviço não é cobrado duas vezes quando o caixa já registrou a taxa', async () => {
  const c = await cenario({ preco: 100 });
  try {
    // Caixa fecha com o serviço padrão e registra a diferença como pagamento.
    const { fecharSessao } = require('../db/caixa');
    const fechado = await fecharSessao(
      c.sessaoId,
      { formaPagamento: 'pix', desconto: 0, idempotencyKey: CHAVE() },
      'Operador CI'
    );
    assert.equal(fechado.valorCobrado, 110);
    assert.equal(fechado.taxaServico, 10);

    // Sessão fechada: o garçom recebe 409 e não consegue cobrar de novo.
    await assert.rejects(
      () => resumoPagamentoSessao(c.garcom.token, c.sessaoId),
      (e) => e.status === 409
    );
  } finally {
    await limpar(c);
  }
});
