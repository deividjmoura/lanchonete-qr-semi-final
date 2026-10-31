// Issue #39: concorrência financeira e de estoque, semântica de idempotência
// e bordas de arredondamento monetário em PostgreSQL descartável.
// Roda apenas no workflow "PostgreSQL integration"; nenhum dado de produção.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Use somente o PostgreSQL descartável do CI');

const pool = require('../db/pool');
const pedidos = require('../db/pedidos');
const caixa = require('../db/caixa');
const garcons = require('../db/garcons');

async function criarBase(suffix, { estoque = null, preco = 10 } = {}) {
  const categoria = (await pool.query(
    'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
    ['Concorrência CI ' + suffix]
  )).rows[0].id;
  const produto = (await pool.query(
    `INSERT INTO produtos (categoria_id, nome, preco, disponivel, controla_estoque, estoque)
     VALUES ($1, $2, $3, TRUE, $4, $5) RETURNING id`,
    [categoria, 'Produto ' + suffix, preco, estoque !== null, estoque]
  )).rows[0].id;
  const token = randomUUID();
  const mesa = (await pool.query(
    'INSERT INTO mesas (numero, token) VALUES ($1, $2) RETURNING id, numero',
    [920000 + Math.floor(Math.random() * 70000), token]
  )).rows[0];
  return { categoria, produto, token, mesaId: mesa.id, mesaNumero: mesa.numero };
}

async function limpar(base, sessoes = []) {
  for (const sessaoId of sessoes) {
    await pool.query('DELETE FROM auditoria_eventos WHERE alvo_id = $1', [String(sessaoId)]).catch(() => {});
    await pool.query('DELETE FROM sessao_pagamentos WHERE sessao_id = $1', [sessaoId]).catch(() => {});
    await pool.query('DELETE FROM itens_pedido_adicionais WHERE item_pedido_id IN (SELECT id FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id = $1))', [sessaoId]).catch(() => {});
    await pool.query('DELETE FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id = $1)', [sessaoId]).catch(() => {});
    await pool.query('DELETE FROM pedidos WHERE sessao_id = $1', [sessaoId]).catch(() => {});
  }
  await pool.query('DELETE FROM mesa_sessoes WHERE mesa_id = $1', [base.mesaId]).catch(() => {});
  await pool.query('DELETE FROM mesas WHERE id = $1', [base.mesaId]).catch(() => {});
  await pool.query('DELETE FROM produtos WHERE id = $1', [base.produto]).catch(() => {});
  await pool.query('DELETE FROM categorias WHERE id = $1', [base.categoria]).catch(() => {});
}

test('duas compras concorrentes da última unidade: só uma confirma e o estoque nunca fica negativo', async () => {
  const base = await criarBase('estoque-' + randomUUID().slice(0, 8), { estoque: 1 });
  const sessoes = [];
  try {
    const resultados = await Promise.allSettled([
      pedidos.criarPedido(base.token, { idempotencyKey: 'conc-a-' + randomUUID(), items: [{ productId: base.produto, qty: 1 }] }),
      pedidos.criarPedido(base.token, { idempotencyKey: 'conc-b-' + randomUUID(), items: [{ productId: base.produto, qty: 1 }] }),
    ]);
    const aceitos = resultados.filter((r) => r.status === 'fulfilled');
    const rejeitados = resultados.filter((r) => r.status === 'rejected');
    assert.equal(aceitos.length, 1, 'exatamente um pedido deve ser aceito');
    assert.equal(rejeitados.length, 1);
    // A perda da corrida pode se manifestar por três caminhos legítimos,
    // dependendo de qual trava a transação perdedora encontra primeiro:
    // produto marcado indisponível, checagem preventiva de estoque ou o
    // UPDATE com guarda. O invariante importante é "uma aceita, uma rejeita".
    const motivo = String(rejeitados[0].reason && rejeitados[0].reason.message);
    assert.match(motivo, /[Ee]stoque|indisponível|inexistente/);
    aceitos.forEach((r) => sessoes.push(r.value.sessaoId));

    const estoque = await pool.query('SELECT estoque, disponivel FROM produtos WHERE id = $1', [base.produto]);
    assert.equal(Number(estoque.rows[0].estoque), 0);
    assert.equal(estoque.rows[0].disponivel, false);

    const contagem = await pool.query(
      `SELECT COUNT(*)::int AS pedidos,
              COALESCE(SUM((SELECT COUNT(*) FROM itens_pedido ip WHERE ip.pedido_id = p.id)),0)::int AS itens
         FROM pedidos p JOIN mesa_sessoes s ON s.id = p.sessao_id
        WHERE s.mesa_id = $1`,
      [base.mesaId]
    );
    assert.equal(contagem.rows[0].pedidos, 1);
    assert.equal(contagem.rows[0].itens, 1);
  } finally {
    await limpar(base, sessoes);
  }
});

test('idempotência: chave inválida falha, chaves diferentes separam pedidos e payload divergente na mesma chave devolve o original', async () => {
  const base = await criarBase('idem-' + randomUUID().slice(0, 8), { estoque: 50 });
  const sessoes = [];
  try {
    await assert.rejects(
      () => pedidos.criarPedido(base.token, { idempotencyKey: 'curta', items: [{ productId: base.produto, qty: 1 }] }),
      /idempotência inválida/
    );

    const chaveA = 'idem-a-' + randomUUID();
    const primeiro = await pedidos.criarPedido(base.token, {
      idempotencyKey: chaveA,
      items: [{ productId: base.produto, qty: 1 }],
    });
    sessoes.push(primeiro.sessaoId);

    const outro = await pedidos.criarPedido(base.token, {
      idempotencyKey: 'idem-b-' + randomUUID(),
      items: [{ productId: base.produto, qty: 3 }],
    });
    sessoes.push(outro.sessaoId);
    assert.notEqual(primeiro.id, outro.id);

    // Mesma chave com payload DIVERGENTE: a primeira escrita vence e o replay
    // devolve o pedido original, sem baixar estoque de novo.
    const replayDivergente = await pedidos.criarPedido(base.token, {
      idempotencyKey: chaveA,
      items: [{ productId: base.produto, qty: 9 }],
    });
    assert.equal(replayDivergente.idempotentReplay, true);
    assert.equal(replayDivergente.id, primeiro.id);
    assert.equal(replayDivergente.itens.length, 1);
    assert.equal(replayDivergente.itens[0].quantidade, 1);

    const estoque = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [base.produto]);
    assert.equal(Number(estoque.rows[0].estoque), 46, 'baixa apenas 1 + 3 unidades; replay não baixa nada');
  } finally {
    await limpar(base, sessoes);
  }
});

test('valores centavos são preservados em 0,01 + 0,10 + 10,25 e no fechamento', async () => {
  const suffix = 'moeda-' + randomUUID().slice(0, 8);
  const base = await criarBase(suffix, { estoque: 100, preco: 10.25 });
  const barato = (await pool.query(
    'INSERT INTO produtos (categoria_id, nome, preco, disponivel) VALUES ($1, $2, 0.01, TRUE) RETURNING id',
    [base.categoria, 'Centavo ' + suffix]
  )).rows[0].id;
  const medio = (await pool.query(
    'INSERT INTO produtos (categoria_id, nome, preco, disponivel) VALUES ($1, $2, 0.10, TRUE) RETURNING id',
    [base.categoria, 'Dez centavos ' + suffix]
  )).rows[0].id;
  const garcom = await garcons.criarGarcom({ nome: 'Garçom moeda ' + suffix });
  const sessoes = [];
  try {
    const pedido = await pedidos.criarPedido(base.token, {
      idempotencyKey: 'moeda-' + randomUUID(),
      items: [
        { productId: barato, qty: 1 },
        { productId: medio, qty: 1 },
        { productId: base.produto, qty: 1 },
      ],
    });
    sessoes.push(pedido.sessaoId);
    await pool.query('UPDATE mesa_sessoes SET garcom_responsavel_id = $1 WHERE id = $2', [garcom.id, pedido.sessaoId]);
    const itens = await pool.query('SELECT id FROM itens_pedido WHERE pedido_id = $1 ORDER BY id', [pedido.id]);
    for (const item of itens.rows) {
      await pedidos.setStatusItem(item.id, 'concluido');
      await garcons.entregarComoGarcom(pedido.id, garcom.token, [item.id]);
    }
    const sessao = await pool.query('SELECT valor_total FROM mesa_sessoes WHERE id = $1', [pedido.sessaoId]);
    assert.equal(Number(sessao.rows[0].valor_total), 10.36);

    const fechado = await caixa.fecharSessao(pedido.sessaoId, {
      formaPagamento: 'dinheiro',
      desconto: 0,
      taxaServico: 0, taxaServicoMotivo: 'Isenção de serviço no cenário de teste',
      idempotencyKey: 'fecha-' + randomUUID(),
    }, 'QA Moeda', { autorizacaoGerente: { id: 900001, nome: 'Gerente QA (fixture)' } });
    assert.equal(fechado.valorCobrado, 10.36);
    assert.equal(fechado.status, 'fechada');
  } finally {
    await pool.query('DELETE FROM garcons WHERE id = $1', [garcom.id]).catch(() => {});
    await pool.query('DELETE FROM produtos WHERE id = ANY($1::int[])', [[barato, medio]]).catch(() => {});
    await limpar(base, sessoes);
  }
});

test('pagamentos parciais concorrentes nunca ultrapassam o saldo e falha de fechamento reverte tudo', async () => {
  const base = await criarBase('pag-' + randomUUID().slice(0, 8), { estoque: 10 });
  const sessoes = [];
  try {
    const pedido = await pedidos.criarPedido(base.token, {
      idempotencyKey: 'pag-' + randomUUID(),
      items: [{ productId: base.produto, qty: 1 }],
    });
    sessoes.push(pedido.sessaoId);
    // saldo de R$ 10,00 entregue
    await pool.query('UPDATE itens_pedido SET status = $2 WHERE id = (SELECT id FROM itens_pedido WHERE pedido_id = $1 LIMIT 1)', [pedido.id, 'entregue']);
    await pool.query("UPDATE pedidos SET status = 'entregue' WHERE id = $1", [pedido.id]);
    await pool.query('UPDATE mesa_sessoes SET valor_total = 10 WHERE id = $1', [pedido.sessaoId]);

    const resultados = await Promise.allSettled([
      caixa.registrarPagamento(pedido.sessaoId, { valor: 6, formaPagamento: 'dinheiro', idempotencyKey: 'p1-' + randomUUID() }, 'QA'),
      caixa.registrarPagamento(pedido.sessaoId, { valor: 6, formaPagamento: 'dinheiro', idempotencyKey: 'p2-' + randomUUID() }, 'QA'),
    ]);
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(resultados.filter((r) => r.status === 'rejected').length, 1);
    const lancamentos = await pool.query(
      'SELECT COUNT(*)::int AS n, COALESCE(SUM(valor),0)::numeric AS total FROM sessao_pagamentos WHERE sessao_id = $1',
      [pedido.sessaoId]
    );
    assert.equal(lancamentos.rows[0].n, 1);
    assert.equal(Number(lancamentos.rows[0].total), 6);

    // Injeção de falha: fechamento inválido não deixa nem pagamento extra
    // nem sessão fechada — a transação inteira reverte.
    const antes = await pool.query('SELECT COUNT(*)::int AS n FROM sessao_pagamentos WHERE sessao_id = $1', [pedido.sessaoId]);
    await assert.rejects(
      () => caixa.fecharSessao(pedido.sessaoId, { formaPagamento: 'bitcoin', idempotencyKey: 'fx-' + randomUUID() }, 'QA'),
      /Forma de pagamento inválida/
    );
    const depois = await pool.query(
      "SELECT status, (SELECT COUNT(*)::int FROM sessao_pagamentos WHERE sessao_id = $1) AS pagamentos FROM mesa_sessoes WHERE id = $1",
      [pedido.sessaoId]
    );
    assert.equal(depois.rows[0].status, 'aberta');
    assert.equal(depois.rows[0].pagamentos, antes.rows[0].n);
  } finally {
    await limpar(base, sessoes);
  }
});

test.after(async () => {
  await pool.end();
});
