'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
assert.ok(process.env.DATABASE_URL, 'Banco descartável obrigatório');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(url.hostname));
assert.equal(url.pathname, '/qradmin_test');
assert.equal(process.env.NODE_ENV, 'test');
const pool = require('../db/pool');
const { dashboardGeral, intervaloDashboard, validarPeriodoDashboard } = require('../db/dashboard-geral');
const { resumoDia } = require('../db/dashboard');
test.after(() => pool.end());

test('períodos civis usam o fuso da casa e comparações do mesmo tamanho', async () => {
  const antes = await intervaloDashboard(pool, 'hoje', 'America/Sao_Paulo', '2026-01-01T02:59:59.999Z');
  const depois = await intervaloDashboard(pool, 'hoje', 'America/Sao_Paulo', '2026-01-01T03:00:00Z');
  assert.equal(antes.from, '2025-12-31');
  assert.equal(depois.from, '2026-01-01');
  assert.deepEqual(depois.anterior, { from: '2025-12-31', to: '2025-12-31', dias: 1 });
  const semana = await intervaloDashboard(pool, 'semana', 'America/Sao_Paulo', '2026-01-07T15:00:00Z');
  assert.equal(semana.from, '2026-01-05'); // segunda
  assert.equal(semana.to, '2026-01-07');
  assert.deepEqual(semana.anterior, { from: '2026-01-02', to: '2026-01-04', dias: 3 });
  const mes = await intervaloDashboard(pool, 'mes', 'America/Sao_Paulo', '2026-03-31T15:00:00Z');
  assert.equal(mes.from, '2026-03-01');
  assert.equal(mes.dias, 31);
  assert.deepEqual(mes.anterior, { from: '2026-01-29', to: '2026-02-28', dias: 31 });
  // A virada do horário de verão também usa meia-noite local, não 24 horas UTC.
  const nyAntes = await intervaloDashboard(pool, 'hoje', 'America/New_York', '2026-03-08T04:59:59Z');
  const nyDepois = await intervaloDashboard(pool, 'hoje', 'America/New_York', '2026-03-08T05:00:00Z');
  assert.equal(nyAntes.from, '2026-03-07');
  assert.equal(nyDepois.from, '2026-03-08');
  for (const invalido of ['', 'ano', 'TODAY', null, "hoje' OR 1=1 --"]) {
    assert.throws(() => validarPeriodoDashboard(invalido), (e) => e.status === 400);
    await assert.rejects(() => dashboardGeral({ periodo: invalido }), (e) => e.status === 400);
  }
});

test('dashboard concilia contas e pagamentos divididos, ignora cancelamentos e separa retrato atual', async () => {
  const inicio = "((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date::timestamp AT TIME ZONE 'America/Sao_Paulo')";
  const antes = {};
  for (const periodo of ['hoje', 'semana', 'mes']) antes[periodo] = await dashboardGeral({ periodo });
  const ids = { mesas: [], sessoes: [], pedidos: [], garcons: [], categoria: null, produto: null, adicional: null };
  try {
    const livres = await pool.query(`SELECT n FROM generate_series(1, 20) n WHERE NOT EXISTS (SELECT 1 FROM mesas WHERE numero=n) LIMIT 2`);
    assert.equal(livres.rowCount, 2, 'teste precisa de duas mesas não utilizadas entre as habilitadas');
    const mesas = await pool.query(`INSERT INTO mesas(numero,status) VALUES ($1,'ocupada'),($2,'livre'),($3,'ocupada') RETURNING id`, [livres.rows[0].n, livres.rows[1].n, 900000 + process.pid]);
    ids.mesas = mesas.rows.map((r) => r.id);
    ids.categoria = (await pool.query('INSERT INTO categorias(nome,ordem) VALUES($1,0) RETURNING id', ['Dashboard teste ' + process.pid])).rows[0].id;
    ids.produto = (await pool.query('INSERT INTO produtos(categoria_id,nome,preco) VALUES($1,$2,10) RETURNING id', [ids.categoria, 'Item dashboard ' + process.pid])).rows[0].id;
    ids.adicional = (await pool.query('INSERT INTO adicionais(produto_id,nome,preco) VALUES($1,$2,3) RETURNING id', [ids.produto, 'Extra dashboard'])).rows[0].id;
    ids.garcons = (await pool.query(`INSERT INTO garcons(nome,ativo,removido_em) VALUES
      ('Dashboard ativo',TRUE,NULL), ('Dashboard removido',FALSE,now()) RETURNING id`)).rows.map((r) => r.id);

    // 100 dividido em duas formas, 30 sem lançamentos, 20 com lançamento
    // histórico excedente de 25; a conta de ontem termina um microssegundo
    // antes da fronteira. A de amanhã deve ficar fora de TODOS os filtros.
    const fechadas = await pool.query(`INSERT INTO mesa_sessoes(mesa_id,status,fechada_em,valor_total,desconto,taxa_servico,valor_cobrado,forma_pagamento)
      VALUES ($1,'fechada',${inicio},100,10,10,100,'cartao_debito'),
             ($1,'fechada',${inicio} + interval '1 minute',30,0,0,30,'pix'),
             ($1,'fechada',${inicio} + interval '2 minutes',20,0,0,20,'dinheiro'),
             ($1,'fechada',${inicio} - interval '1 microsecond',70,0,0,70,'pix'),
             ($1,'fechada',${inicio} + interval '1 day',999,0,0,999,'pix') RETURNING id`, [ids.mesas[0]]);
    ids.sessoes.push(...fechadas.rows.map((r) => r.id));
    const abertas = await pool.query(`INSERT INTO mesa_sessoes(mesa_id,status,valor_total) VALUES($1,'aberta',999) RETURNING id`, [ids.mesas[0]]);
    ids.sessoes.push(abertas.rows[0].id);
    await pool.query(`INSERT INTO sessao_pagamentos(sessao_id,valor,forma_pagamento) VALUES
      ($1,40,'pix'),($1,60,'cartao_debito'),($2,25,'dinheiro'),($3,5,'pix')`, [ids.sessoes[0], ids.sessoes[2], ids.sessoes[5]]);
    const pedidos = await pool.query(`INSERT INTO pedidos(sessao_id,status,criado_em) VALUES
      ($1,'entregue',${inicio}),($1,'cancelado',${inicio} + interval '1 minute'),
      ($2,'em_producao',${inicio} + interval '2 minutes') RETURNING id`, [ids.sessoes[0], ids.sessoes[5]]);
    ids.pedidos.push(...pedidos.rows.map((r) => r.id));
    const itens = await pool.query(`INSERT INTO itens_pedido(pedido_id,produto_id,quantidade,preco_unitario,status,entregue_em)
      VALUES ($1,$4,2,10,'entregue',${inicio} + interval '30 minutes'),
             ($1,$4,1,10,'entregue',${inicio} + interval '60 minutes'),
             ($2,$4,100,10,'recebido',NULL),
             ($3,$4,2,10,'entregue',NULL),
             ($3,$4,3,10,'em_producao',NULL),
             ($3,$4,4,10,'concluido',NULL),
             ($3,$4,2,10,'aceito',NULL),
             ($3,$4,1,10,'retirado',NULL),
             ($3,$4,5,10,'recebido',NULL),
             ($3,$4,100,10,'cancelado',NULL) RETURNING id`, [ids.pedidos[0], ids.pedidos[1], ids.pedidos[2], ids.produto]);
    await pool.query('INSERT INTO itens_pedido_adicionais(item_pedido_id,adicional_id,preco_unitario) VALUES($1,$2,3)', [itens.rows[3].id, ids.adicional]);

    const hoje = await dashboardGeral({ periodo: 'hoje' });
    assert.equal(hoje.resumo.faturamento - antes.hoje.resumo.faturamento, 150);
    assert.equal(hoje.resumo.vendasBrutas - antes.hoje.resumo.vendasBrutas, 150);
    assert.equal(hoje.resumo.servicoTotal - antes.hoje.resumo.servicoTotal, 10);
    assert.equal(hoje.resumo.descontosTotal - antes.hoje.resumo.descontosTotal, 10);
    assert.equal(hoje.resumo.contasFechadas - antes.hoje.resumo.contasFechadas, 3);
    assert.equal(hoje.resumo.pedidosTotal - antes.hoje.resumo.pedidosTotal, 3);
    assert.equal(hoje.anterior.faturamento - antes.hoje.anterior.faturamento, 70, 'fechamento no último microssegundo pertence a ontem');
    assert.equal(hoje.porDia.length, 1);
    assert.equal(hoje.historico.length, 7);
    assert.equal(hoje.porDia.reduce((s, d) => s + d.faturamento, 0), hoje.resumo.faturamento);
    assert.equal((await resumoDia()).faturamento, hoje.resumo.faturamento, 'contrato e relatório legados conservam o mesmo faturamento');
    assert.equal(hoje.topProdutos.find((p) => p.id === ids.produto).quantidade, 20, 'exclui pedido e item cancelados');
    const formas = Object.fromEntries(hoje.pagamentos.formas.map((f) => [f.forma, f.valor]));
    const formasAntes = Object.fromEntries(antes.hoje.pagamentos.formas.map((f) => [f.forma, f.valor]));
    assert.equal(formas.pix - (formasAntes.pix || 0), 40);
    assert.equal(formas.cartao_debito - (formasAntes.cartao_debito || 0), 60);
    assert.equal(formas.dinheiro - (formasAntes.dinheiro || 0), 25);
    assert.equal(hoje.pagamentos.semDetalhamento - antes.hoje.pagamentos.semDetalhamento, 30);
    assert.equal(hoje.pagamentos.excedente - antes.hoje.pagamentos.excedente, 5);
    const registrado = hoje.pagamentos.formas.reduce((s, f) => s + f.valor, 0);
    assert.equal(registrado + hoje.pagamentos.semDetalhamento - hoje.pagamentos.excedente, hoje.resumo.faturamento);
    assert.equal(hoje.atual.sessoesAbertas - antes.hoje.atual.sessoesAbertas, 1);
    assert.equal(hoje.atual.consumoEntregue - antes.hoje.atual.consumoEntregue, 26, 'recalcula itens entregues e adicionais, não usa acumulador obsoleto');
    assert.equal(hoje.atual.pagamentosParciais - antes.hoje.atual.pagamentosParciais, 5);
    assert.equal(hoje.atual.saldoPendente - antes.hoje.atual.saldoPendente, 21);
    assert.equal(hoje.atual.mesas.total - antes.hoje.atual.mesas.total, 2, 'mesa fora do limite habilitado é excluída');
    assert.equal(hoje.atual.mesas.ocupadas - antes.hoje.atual.mesas.ocupadas, 1);
    assert.equal(hoje.atual.mesas.livres - antes.hoje.atual.mesas.livres, 1);
    assert.equal(hoje.atual.garconsAtivos - antes.hoje.atual.garconsAtivos, 1);
    for (const [campo, esperado] of Object.entries({ aguardando: 5, preparo: 3, prontos: 6, retirados: 1 })) {
      assert.equal(hoje.atual.itens[campo] - antes.hoje.atual.itens[campo], esperado);
    }
    assert.equal(hoje.entrega.unidades - antes.hoje.entrega.unidades, 3);
    const mediaEsperada = ((antes.hoje.entrega.mediaMinutos || 0) * antes.hoje.entrega.unidades + 2 * 30 + 60) / hoje.entrega.unidades;
    assert.ok(Math.abs(hoje.entrega.mediaMinutos - mediaEsperada) < 0.15, 'média ponderada por unidade exclui itens sem horário');
    for (const periodo of ['semana', 'mes']) {
      const d = await dashboardGeral({ periodo });
      const ontemIncluso = d.periodo.from <= antes.hoje.periodo.anterior.from;
      assert.equal(d.resumo.faturamento - antes[periodo].resumo.faturamento, ontemIncluso ? 220 : 150);
      assert.equal(d.porDia.length, d.periodo.dias);
      assert.equal(d.porDia.reduce((s, dia) => s + dia.faturamento, 0), d.resumo.faturamento);
      assert.deepEqual(d.atual, hoje.atual, 'retrato atual não muda com o filtro');
    }
  } finally {
    if (ids.pedidos.length) await pool.query('DELETE FROM pedidos WHERE id=ANY($1::int[])', [ids.pedidos]);
    if (ids.sessoes.length) await pool.query('DELETE FROM mesa_sessoes WHERE id=ANY($1::int[])', [ids.sessoes]);
    if (ids.mesas.length) await pool.query('DELETE FROM mesas WHERE id=ANY($1::int[])', [ids.mesas]);
    if (ids.garcons.length) await pool.query('DELETE FROM garcons WHERE id=ANY($1::int[])', [ids.garcons]);
    if (ids.adicional) await pool.query('DELETE FROM adicionais WHERE id=$1', [ids.adicional]);
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id=$1', [ids.produto]);
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id=$1', [ids.categoria]);
  }
});
