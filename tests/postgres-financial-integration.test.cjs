const test = require('node:test');
const assert = require('node:assert/strict');

assert.ok(process.env.DATABASE_URL, 'Este teste deve rodar apenas contra o PostgreSQL descartável do CI');

const pool = require('../db/pool');
const { registrarPagamento, fecharSessao } = require('../db/caixa');
const { relatorioVendas } = require('../db/relatorio');

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
    }, 'QA PostgreSQL', null, { atorTipo: 'staff', atorId: 777, requestId: 'ci-payment-request-1' });

    assert.equal(parcial.valorTotal, 20);
    assert.equal(parcial.valorPago, 10);
    assert.equal(parcial.valorRestante, 10);
    assert.equal(parcial.pagamento.operadorNome, 'QA PostgreSQL');
    assert.equal(parcial.idempotentReplay, false);

    const replay = await registrarPagamento(ids.sessao, {
      valor: 10,
      formaPagamento: 'dinheiro',
      idempotencyKey: chaveParcial,
    }, 'QA PostgreSQL', null, { atorTipo: 'staff', atorId: 777, requestId: 'ci-payment-request-1' });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.pagamento.id, parcial.pagamento.id);

    const eventosPagamento = await pool.query(
      `SELECT ator_tipo, ator_id, ator_nome, acao, alvo_id, request_id, contexto
       FROM auditoria_eventos WHERE acao = 'pagamento_parcial' AND alvo_id = $1 ORDER BY id`,
      [String(ids.sessao)]
    );
    assert.equal(eventosPagamento.rowCount, 1, 'retry idempotente não pode duplicar evento financeiro');
    assert.equal(eventosPagamento.rows[0].ator_tipo, 'staff');
    assert.equal(Number(eventosPagamento.rows[0].ator_id), 777);
    assert.equal(eventosPagamento.rows[0].ator_nome, 'QA PostgreSQL');
    assert.equal(eventosPagamento.rows[0].request_id, 'ci-payment-request-1');
    assert.equal(Number(eventosPagamento.rows[0].contexto.pagamentoId), Number(parcial.pagamento.id));
    assert.equal(Number(eventosPagamento.rows[0].contexto.valor), 10);

    await assert.rejects(
      () => registrarPagamento(ids.sessao, {
        valor: 11,
        formaPagamento: 'pix',
        idempotencyKey: '00000000-0000-4000-8000-000000000103',
      }, 'QA PostgreSQL'),
      (error) => error.status === 400
    );

    const fechamentoBody = {
      formaPagamento: 'pix',
      desconto: 0,
      taxaServico: 0, taxaServicoMotivo: 'Isenção de serviço no cenário de teste',
      idempotencyKey: chaveFechamento,
    };
    const fechado = await fecharSessao(ids.sessao, fechamentoBody, 'QA PostgreSQL', {
      atorTipo: 'staff', atorId: 778, requestId: 'ci-close-request-1',
    });
    assert.equal(fechado.status, 'fechada');
    assert.equal(fechado.valorTotal, 20);
    assert.equal(fechado.valorCobrado, 20);
    assert.equal(fechado.valorPago, 20);
    assert.equal(fechado.idempotentReplay, false);

    const eventoFechamento = await pool.query(
      `SELECT ator_tipo, ator_id, request_id FROM auditoria_eventos
       WHERE acao = 'sessao_fechada' AND alvo_id = $1 ORDER BY id`,
      [String(ids.sessao)]
    );
    assert.equal(eventoFechamento.rowCount, 1);
    assert.equal(eventoFechamento.rows[0].ator_tipo, 'staff');
    assert.equal(Number(eventoFechamento.rows[0].ator_id), 778);
    assert.equal(eventoFechamento.rows[0].request_id, 'ci-close-request-1');

    const fechamentoReplay = await fecharSessao(ids.sessao, fechamentoBody, 'QA PostgreSQL', {
      atorTipo: 'staff', atorId: 778, requestId: 'ci-close-request-1',
    });
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
    if (ids.sessao) await pool.query('DELETE FROM auditoria_eventos WHERE alvo_id = $1', [String(ids.sessao)]).catch(() => {});
    if (ids.pedido) await pool.query('DELETE FROM itens_pedido WHERE pedido_id = $1', [ids.pedido]).catch(() => {});
    if (ids.pedido) await pool.query('DELETE FROM pedidos WHERE id = $1', [ids.pedido]).catch(() => {});
    if (ids.sessao) await pool.query('DELETE FROM mesa_sessoes WHERE id = $1', [ids.sessao]).catch(() => {});
    if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id = $1', [ids.mesa]).catch(() => {});
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id = $1', [ids.produto]).catch(() => {});
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id = $1', [ids.categoria]).catch(() => {});
  }
});

test('PostgreSQL real: pagamento integral audita pagamento e fechamento automático atomicamente', async () => {
  const ids = { categoria: null, produto: null, mesa: null, sessao: null, pedido: null };
  const mesaNumero = 2000 + (process.pid % 1000);
  try {
    ids.categoria = (await pool.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
      ['CI Quitação automática ' + process.pid]
    )).rows[0].id;
    ids.produto = (await pool.query(
      'INSERT INTO produtos (categoria_id, nome, preco, disponivel) VALUES ($1, $2, 10, TRUE) RETURNING id',
      [ids.categoria, 'Produto quitação automática ' + process.pid]
    )).rows[0].id;
    ids.mesa = (await pool.query(
      "INSERT INTO mesas (numero, status) VALUES ($1, 'ocupada') RETURNING id",
      [mesaNumero]
    )).rows[0].id;
    ids.sessao = (await pool.query(
      "INSERT INTO mesa_sessoes (mesa_id, status, cliente_nome, valor_total) VALUES ($1, 'aberta', 'Teste automático', 0) RETURNING id",
      [ids.mesa]
    )).rows[0].id;
    ids.pedido = (await pool.query(
      "INSERT INTO pedidos (sessao_id, status, cliente_nome) VALUES ($1, 'entregue', 'Teste automático') RETURNING id",
      [ids.sessao]
    )).rows[0].id;
    await pool.query(
      "INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, status) VALUES ($1, $2, 1, 10, 'entregue')",
      [ids.pedido, ids.produto]
    );

    const out = await registrarPagamento(ids.sessao, {
      valor: 10,
      formaPagamento: 'pix',
      idempotencyKey: '00000000-0000-4000-8000-000000000104',
    }, 'QA Quitação', null, {
      atorTipo: 'staff', atorId: 779, requestId: 'ci-auto-close-request',
    });
    assert.equal(out.sessaoFechada, true);
    assert.equal(out.status, 'fechada');

    const eventos = await pool.query(
      `SELECT acao, ator_tipo, ator_id, request_id, contexto
       FROM auditoria_eventos WHERE alvo_id = $1 AND alvo_tipo='sessao' ORDER BY id`,
      [String(ids.sessao)]
    );
    assert.deepEqual(eventos.rows.map((e) => e.acao), ['pagamento_parcial', 'sessao_fechada']);
    for (const evento of eventos.rows) {
      assert.equal(evento.ator_tipo, 'staff');
      assert.equal(Number(evento.ator_id), 779);
      assert.equal(evento.request_id, 'ci-auto-close-request');
    }
    assert.equal(eventos.rows[1].contexto.origem, 'pagamento_integral');
  } finally {
    if (ids.sessao) {
      await pool.query('DELETE FROM sessao_pagamentos WHERE sessao_id=$1', [ids.sessao]).catch(() => {});
      await pool.query('DELETE FROM auditoria_eventos WHERE alvo_id=$1', [String(ids.sessao)]).catch(() => {});
    }
    if (ids.pedido) await pool.query('DELETE FROM itens_pedido WHERE pedido_id=$1', [ids.pedido]).catch(() => {});
    if (ids.pedido) await pool.query('DELETE FROM pedidos WHERE id=$1', [ids.pedido]).catch(() => {});
    if (ids.sessao) await pool.query('DELETE FROM mesa_sessoes WHERE id=$1', [ids.sessao]).catch(() => {});
    if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id=$1', [ids.mesa]).catch(() => {});
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id=$1', [ids.produto]).catch(() => {});
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id=$1', [ids.categoria]).catch(() => {});
  }
});

test('PostgreSQL real: #153 fechamento sem taxa aplica 10% sobre o consumo bruto; ajuste exige motivo auditável', async () => {
  const criado = [];
  async function novaSessao(rotulo, mesaNumero) {
    const ids = { rotulo };
    ids.categoria = (await pool.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
      ['CI Taxa Serviço ' + rotulo + ' ' + process.pid]
    )).rows[0].id;
    ids.produto = (await pool.query(
      'INSERT INTO produtos (categoria_id, nome, preco, disponivel) VALUES ($1, $2, 10, TRUE) RETURNING id',
      [ids.categoria, 'Produto taxa serviço ' + rotulo]
    )).rows[0].id;
    ids.mesa = (await pool.query(
      "INSERT INTO mesas (numero, status) VALUES ($1, 'ocupada') RETURNING id",
      [mesaNumero]
    )).rows[0].id;
    ids.sessao = (await pool.query(
      "INSERT INTO mesa_sessoes (mesa_id, status, cliente_nome, valor_total) VALUES ($1, 'aberta', 'Teste taxa', 0) RETURNING id",
      [ids.mesa]
    )).rows[0].id;
    ids.pedido = (await pool.query(
      "INSERT INTO pedidos (sessao_id, status, cliente_nome) VALUES ($1, 'entregue', 'Teste taxa') RETURNING id",
      [ids.sessao]
    )).rows[0].id;
    // Consumo bruto entregue: 2 x R$10 = R$20 → serviço padrão (10%) = R$2.
    await pool.query(
      "INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, status) VALUES ($1, $2, 2, 10, 'entregue')",
      [ids.pedido, ids.produto]
    );
    criado.push(ids);
    return ids;
  }

  try {
    // 1) Sem taxaServico no body: aplica o padrão de 10% sobre o bruto.
    const a = await novaSessao('padrao', 4000 + (process.pid % 900));
    const fechadoPadrao = await fecharSessao(a.sessao, {
      formaPagamento: 'pix',
      desconto: 0,
      idempotencyKey: '00000000-0000-4000-8000-000000000201',
    }, 'QA PostgreSQL', { atorTipo: 'staff', atorId: 781, requestId: 'ci-taxa-padrao' });
    assert.equal(fechadoPadrao.valorTotal, 20);
    assert.equal(fechadoPadrao.taxaServico, 2);
    assert.equal(fechadoPadrao.taxaServicoPadrao, 2);
    assert.equal(fechadoPadrao.taxaServicoPercentual, 10);
    assert.equal(fechadoPadrao.taxaServicoAjustada, false);
    assert.equal(fechadoPadrao.valorCobrado, 22);

    const replay = await fecharSessao(a.sessao, {
      formaPagamento: 'pix',
      desconto: 0,
      idempotencyKey: '00000000-0000-4000-8000-000000000201',
    }, 'QA PostgreSQL', { atorTipo: 'staff', atorId: 781, requestId: 'ci-taxa-padrao' });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.valorCobrado, 22);

    const evPadrao = await pool.query(
      "SELECT contexto FROM auditoria_eventos WHERE acao = 'sessao_fechada' AND alvo_id = $1 ORDER BY id",
      [String(a.sessao)]
    );
    assert.equal(evPadrao.rowCount, 1, 'replay idempotente não duplica auditoria');
    assert.equal(Number(evPadrao.rows[0].contexto.taxaServico), 2);
    assert.equal(Number(evPadrao.rows[0].contexto.taxaServicoPadrao), 2);
    assert.equal(evPadrao.rows[0].contexto.taxaServicoAjustada, false);
    assert.equal(evPadrao.rows[0].contexto.taxaServicoMotivo, null);

    // 2) Remover o serviço (taxa 0) sem motivo: rejeita 400 e não fecha.
    const b = await novaSessao('sem-motivo', 5000 + (process.pid % 900));
    await assert.rejects(
      () => fecharSessao(b.sessao, {
        formaPagamento: 'pix', desconto: 0, taxaServico: 0,
        idempotencyKey: '00000000-0000-4000-8000-000000000202',
      }, 'QA PostgreSQL'),
      (error) => error.status === 400 && /motivo/i.test(error.message)
    );
    const sessaoB = await pool.query('SELECT status FROM mesa_sessoes WHERE id = $1', [b.sessao]);
    assert.equal(sessaoB.rows[0].status, 'aberta');

    // 3) Remover com motivo: fecha sem serviço e audita o motivo.
    const fechadoSemServico = await fecharSessao(b.sessao, {
      formaPagamento: 'pix', desconto: 0, taxaServico: 0,
      taxaServicoMotivo: 'Cliente pediu para remover o serviço',
      idempotencyKey: '00000000-0000-4000-8000-000000000203',
    }, 'QA PostgreSQL', { atorTipo: 'staff', atorId: 782, requestId: 'ci-taxa-ajuste' });
    assert.equal(fechadoSemServico.taxaServico, 0);
    assert.equal(fechadoSemServico.taxaServicoAjustada, true);
    assert.equal(fechadoSemServico.valorCobrado, 20);
    const evAjuste = await pool.query(
      "SELECT contexto FROM auditoria_eventos WHERE acao = 'sessao_fechada' AND alvo_id = $1 ORDER BY id",
      [String(b.sessao)]
    );
    assert.equal(evAjuste.rowCount, 1);
    assert.equal(evAjuste.rows[0].contexto.taxaServicoAjustada, true);
    assert.equal(evAjuste.rows[0].contexto.taxaServicoMotivo, 'Cliente pediu para remover o serviço');
  } finally {
    for (const ids of criado) {
      await pool.query('DELETE FROM sessao_pagamentos WHERE sessao_id=$1', [ids.sessao]).catch(() => {});
      await pool.query('DELETE FROM auditoria_eventos WHERE alvo_id=$1', [String(ids.sessao)]).catch(() => {});
      await pool.query('DELETE FROM itens_pedido WHERE pedido_id=$1', [ids.pedido]).catch(() => {});
      await pool.query('DELETE FROM pedidos WHERE id=$1', [ids.pedido]).catch(() => {});
      await pool.query('DELETE FROM mesa_sessoes WHERE id=$1', [ids.sessao]).catch(() => {});
      await pool.query('DELETE FROM mesas WHERE id=$1', [ids.mesa]).catch(() => {});
      await pool.query('DELETE FROM produtos WHERE id=$1', [ids.produto]).catch(() => {});
      await pool.query('DELETE FROM categorias WHERE id=$1', [ids.categoria]).catch(() => {});
    }
  }
});

test('PostgreSQL real: #154 relatório separa vendas × serviço × descontos e atribui serviço ao garçom responsável', async () => {
  const ids = { garcom: null, mesa: null, sessao: null };
  try {
    ids.garcom = (await pool.query(
      'INSERT INTO garcons (nome) VALUES ($1) RETURNING id',
      ['Garçom Relatório CI ' + process.pid]
    )).rows[0].id;
    ids.mesa = (await pool.query(
      "INSERT INTO mesas (numero, status) VALUES ($1, 'livre') RETURNING id",
      [7000 + (process.pid % 900)]
    )).rows[0].id;
    // Conta fechada: vendas 100 − desconto 5 + serviço 10 = 105 cobrado.
    ids.sessao = (await pool.query(
      `INSERT INTO mesa_sessoes
         (mesa_id, status, cliente_nome, valor_total, desconto, taxa_servico,
          valor_cobrado, forma_pagamento, garcom_responsavel_id, aberta_em, fechada_em)
       VALUES ($1, 'fechada', 'Cliente Relatório', 100, 5, 10, 105, 'pix', $2, now(), now())
       RETURNING id`,
      [ids.mesa, ids.garcom]
    )).rows[0].id;

    const hoje = (await pool.query(
      "SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia"
    )).rows[0].dia;

    const rel = await relatorioVendas({ from: hoje, to: hoje });

    // Identidade do resumo: vendas − descontos + serviço = total cobrado.
    const identidade = Math.abs(
      rel.resumo.vendasBrutas - rel.resumo.descontosTotal + rel.resumo.servicoTotal - rel.resumo.totalCobrado
    );
    assert.ok(identidade < 0.02, `resumo não reconcilia (diferença ${identidade})`);
    assert.ok(rel.resumo.vendasBrutas >= 100, 'vendas brutas incluem a conta do teste');
    assert.ok(rel.resumo.servicoTotal >= 10, 'serviço total inclui a conta do teste');

    // Por dia soma igual ao resumo do período.
    const somaDias = rel.porDia.reduce((acc, d) => acc + Number(d.totalCobrado || 0), 0);
    assert.ok(
      Math.abs(somaDias - rel.resumo.totalCobrado) < 0.02,
      'porDia não reconcilia com o resumo'
    );
    const somaServicoDias = rel.porDia.reduce((acc, d) => acc + Number(d.servicoTotal || 0), 0);
    assert.ok(Math.abs(somaServicoDias - rel.resumo.servicoTotal) < 0.02);

    // Comissão: serviço integral ao responsável pela sessão.
    const grupo = rel.porGarcom.find((g) => Number(g.garcomId) === Number(ids.garcom));
    assert.ok(grupo, 'porGarcom deve conter o garçom responsável');
    assert.equal(grupo.contas, 1);
    assert.equal(grupo.vendasBrutas, 100);
    assert.equal(grupo.servicoTotal, 10);
    assert.equal(grupo.descontosTotal, 5);
    assert.equal(grupo.totalCobrado, 105);

    // Detalhamento: conta aparece com o responsável nomeado.
    const conta = rel.contas.find((c) => Number(c.id) === Number(ids.sessao));
    assert.ok(conta, 'contas deve conter a sessão do teste');
    assert.equal(conta.valor, 100);
    assert.equal(conta.taxaServico, 10);
    assert.equal(conta.valorCobrado, 105);
    assert.match(String(conta.garcomResponsavel || ''), /Garçom Relatório CI/);
  } finally {
    if (ids.sessao) await pool.query('DELETE FROM mesa_sessoes WHERE id=$1', [ids.sessao]).catch(() => {});
    if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id=$1', [ids.mesa]).catch(() => {});
    if (ids.garcom) await pool.query('DELETE FROM garcons WHERE id=$1', [ids.garcom]).catch(() => {});
  }
});

test.after(async () => {
  await pool.end();
});
