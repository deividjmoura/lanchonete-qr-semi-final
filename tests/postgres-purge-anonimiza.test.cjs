'use strict';

// Issue #44 — a purga ANONIMIZA, não apaga.
//
// Decisão do responsável: remover `cliente_nome` e observações livres, mas
// PRESERVAR valor, forma de pagamento e data. O comportamento anterior
// (`DELETE` de sessões, pedidos, itens e pagamentos) destruía a evidência de
// conciliação — e é justamente o que este teste impede de voltar.
//
// Roda contra o PostgreSQL descartável: a garantia depende de UPDATE sob
// transação com JOIN no corte de data, o que um mock não prova.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do banco descartável');
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname), 'PostgreSQL local/CI obrigatório');
assert.strictEqual(databaseUrl.pathname, '/qradmin_test', 'Banco de teste obrigatório');
assert.strictEqual(process.env.NODE_ENV, 'test', 'NODE_ENV=test obrigatório');

const pool = require('../db/pool');
const { purgeHistorico } = require('../db/purge');
const { relatorioVendas } = require('../db/relatorio');

const run = crypto.randomUUID().slice(0, 8);
const criados = { mesas: [], sessoes: [], staff: [] };
let staffId = null;
let antigaId = null;   // fechada há muito tempo: entra no corte
let recenteId = null;  // fechada agora: fica fora do corte
let abertaId = null;   // aberta: nunca é tocada

const CORTE = '2026-01-01';
// request IDs únicos por execução: a tabela de auditoria é compartilhada e não
// roda em transação descartável a cada teste.
const REQ1 = `qa-purge-1-${run}`;
const REQ2 = `qa-purge-2-${run}`;

test.before(async () => {
  const { rows: staff } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, ativo)
     VALUES ($1, $2, 'x', 'caixa', TRUE) RETURNING id`,
    [`Operador Purga ${run}`, `purga-${run}`]
  );
  staffId = staff[0].id;
  criados.staff.push(staffId);

  const criarConta = async (numero, status, fechadaEm, nomeCliente) => {
    const { rows: mesa } = await pool.query(
      'INSERT INTO mesas (numero, status) VALUES ($1, $2) RETURNING id',
      [numero, status === 'aberta' ? 'ocupada' : 'livre']
    );
    criados.mesas.push(mesa[0].id);
    const { rows: sess } = await pool.query(
      `INSERT INTO mesa_sessoes (mesa_id, status, cliente_nome, valor_total,
                                 valor_cobrado, forma_pagamento, fechada_em)
       VALUES ($1, $2, $3, 50, 50, 'pix', $4) RETURNING id`,
      [mesa[0].id, status, nomeCliente, fechadaEm]
    );
    criados.sessoes.push(sess[0].id);
    return sess[0].id;
  };

  antigaId = await criarConta(91001, 'fechada', '2025-06-15T20:00:00Z', 'Cliente Antiga ' + run);
  recenteId = await criarConta(91002, 'fechada', '2026-02-20T20:00:00Z', 'Cliente Recente ' + run);
  abertaId = await criarConta(91003, 'aberta', null, 'Cliente Aberta ' + run);

  // Pedido + item + observação livre (o lugar onde telefone costuma vazar).
  for (const sessaoId of [antigaId, recenteId, abertaId]) {
    const { rows: ped } = await pool.query(
      `INSERT INTO pedidos (sessao_id, status, cliente_nome, observacao_geral)
       VALUES ($1, 'entregue', $2, $3) RETURNING id`,
      [sessaoId, 'Cliente da conta', `obs geral ${sessaoId} — tel 47 99999-0000`]
    );
    await pool.query(
      `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario,
                                 status, observacao)
       VALUES ($1, (SELECT id FROM produtos ORDER BY id LIMIT 1), 1, 50, 'entregue', $2)`,
      [ped[0].id, `sem cebola, falar com Maria ${sessaoId}`]
    );
    // Pagamento com autoria: precisa SOBREVIVER à purga inteiro.
    await pool.query(
      `INSERT INTO sessao_pagamentos (sessao_id, valor, forma_pagamento, operador_nome, operador_id)
       VALUES ($1, 50, 'pix', $2, $3)`,
      [sessaoId, 'Operador Purga', staffId]
    );
  }
});

test.after(async () => {
  const sessoes = criados.sessoes;
  if (sessoes.length) {
    await pool.query(
      `DELETE FROM itens_pedido_adicionais WHERE item_pedido_id IN
         (SELECT ip.id FROM itens_pedido ip JOIN pedidos p ON p.id = ip.pedido_id
           WHERE p.sessao_id = ANY($1::int[]))`,
      [sessoes]
    );
    await pool.query(
      `DELETE FROM itens_pedido_remocoes WHERE item_pedido_id IN
         (SELECT ip.id FROM itens_pedido ip JOIN pedidos p ON p.id = ip.pedido_id
           WHERE p.sessao_id = ANY($1::int[]))`,
      [sessoes]
    );
    await pool.query(
      'DELETE FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id = ANY($1::int[]))',
      [sessoes]
    );
    await pool.query('DELETE FROM pedidos WHERE sessao_id = ANY($1::int[])', [sessoes]);
    await pool.query('DELETE FROM sessao_pagamentos WHERE sessao_id = ANY($1::int[])', [sessoes]);
    await pool.query('DELETE FROM mesa_sessoes WHERE id = ANY($1::int[])', [sessoes]);
  }
  if (criados.mesas.length) await pool.query('DELETE FROM mesas WHERE id = ANY($1::int[])', [criados.mesas]);
  if (criados.staff.length) await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [criados.staff]);
  await pool.query(
    `DELETE FROM auditoria_eventos
      WHERE acao = 'historico_anonimizado' AND request_id = ANY($1::text[])`,
    [[REQ1, REQ2]]
  );
  await pool.end();
});

test('#44 dry-run conta o que seria anonimizado sem alterar nada', async () => {
  const antes = await pool.query(
    'SELECT cliente_nome FROM mesa_sessoes WHERE id = $1', [antigaId]
  );
  const previa = await purgeHistorico({ before: CORTE });
  assert.equal(previa.dryRun, true);
  assert.equal(previa.anonimizado, false);
  assert.ok(previa.sessoes >= 1, 'deve enxergar a conta antiga');
  assert.ok(previa.contasPreservadas >= 1, 'informa quantas contas ficam preservadas');
  assert.ok(previa.pagamentosPreservados >= 1);

  const depois = await pool.query(
    'SELECT cliente_nome FROM mesa_sessoes WHERE id = $1', [antigaId]
  );
  assert.equal(depois.rows[0].cliente_nome, antes.rows[0].cliente_nome, 'dry-run não altera dado');
});

test('#44 anonimiza dado pessoal e preserva valor, forma, data e autoria', async () => {
  const out = await purgeHistorico({
    before: CORTE, confirm: true, ator: { id: staffId, nome: 'Operador Purga' },
    requestId: REQ1,
  });
  assert.equal(out.dryRun, false);
  assert.equal(out.anonimizado, true);

  // --- campo pessoal: some ---
  const { rows: sess } = await pool.query(
    `SELECT cliente_nome, valor_total, valor_cobrado, forma_pagamento, fechada_em
       FROM mesa_sessoes WHERE id = $1`, [antigaId]
  );
  assert.equal(sess[0].cliente_nome, '[anonimizado]');
  // --- evidência financeira: fica ---
  assert.equal(Number(sess[0].valor_total), 50, 'valor_total preservado');
  assert.equal(Number(sess[0].valor_cobrado), 50, 'valor_cobrado preservado');
  assert.equal(sess[0].forma_pagamento, 'pix', 'forma de pagamento preservada');
  assert.ok(sess[0].fechada_em, 'data de fechamento preservada');

  const { rows: ped } = await pool.query(
    `SELECT p.cliente_nome, p.observacao_geral, ip.observacao
       FROM pedidos p JOIN itens_pedido ip ON ip.pedido_id = p.id
      WHERE p.sessao_id = $1`, [antigaId]
  );
  assert.equal(ped[0].cliente_nome, '[anonimizado]');
  assert.equal(ped[0].observacao_geral, '[anonimizado]');
  assert.equal(ped[0].observacao, '[anonimizado]', 'observação do item também é campo livre');

  // --- autoria: nunca é dado do cliente, não pode ser apagada ---
  const { rows: pag } = await pool.query(
    'SELECT valor, forma_pagamento, operador_id, operador_nome, criado_em FROM sessao_pagamentos WHERE sessao_id = $1',
    [antigaId]
  );
  assert.equal(pag.length, 1, 'o pagamento não foi apagado');
  assert.equal(Number(pag[0].valor), 50);
  assert.equal(pag[0].forma_pagamento, 'pix');
  assert.equal(Number(pag[0].operador_id), staffId, 'autoria por identidade preservada');
  assert.equal(pag[0].operador_nome, 'Operador Purga');
});

test('#44 não toca em sessão aberta nem em conta fora do corte', async () => {
  const { rows: aberta } = await pool.query(
    'SELECT cliente_nome FROM mesa_sessoes WHERE id = $1', [abertaId]
  );
  assert.match(aberta[0].cliente_nome, /^Cliente Aberta/, 'sessão aberta permanece intacta');

  const { rows: recente } = await pool.query(
    'SELECT cliente_nome FROM mesa_sessoes WHERE id = $1', [recenteId]
  );
  assert.match(recente[0].cliente_nome, /^Cliente Recente/, 'fora do corte permanece intacta');

  const { rows: pedAberto } = await pool.query(
    'SELECT cliente_nome, observacao_geral FROM pedidos WHERE sessao_id = $1', [abertaId]
  );
  assert.equal(pedAberto[0].cliente_nome, 'Cliente da conta');
  assert.match(pedAberto[0].observacao_geral, /tel 47/);
});

test('#44 a conta anonimizada continua no relatório com o valor', async () => {
  const rel = await relatorioVendas({ from: '2025-01-01', to: '2025-12-31' });
  const conta = (rel.contas || []).find((c) => c.id === antigaId);
  assert.ok(conta, 'a conta anonimizada não pode desaparecer do relatório');
  assert.equal(conta.valor, 50, 'o valor continua conciliável');
  assert.equal(conta.forma, 'pix');
  assert.equal(conta.cliente, '[anonimizado]');
});

test('#44 purga é idempotente e auditoria registra o que preservou', async () => {
  const out = await purgeHistorico({
    before: CORTE, confirm: true, ator: { id: staffId, nome: 'Operador Purga' },
    requestId: REQ2,
  });
  assert.equal(out.sessoes, 0, 'segunda execução não encontra mais nome para trocar');
  assert.equal(out.pedidos, 0);
  assert.ok(out.contasPreservadas >= 1, 'a conta continua lá, agora sem dado pessoal');

  const { rows: eventos } = await pool.query(
    `SELECT ator_id, ator_nome, request_id, contexto
       FROM auditoria_eventos
      WHERE acao = 'historico_anonimizado' AND alvo_id = $1 AND request_id = $2
      ORDER BY id`, [CORTE, REQ1]
  );
  assert.ok(eventos.length >= 1, 'a purga precisa deixar trilha');
  const primeiro = eventos[0];
  assert.equal(Number(primeiro.ator_id), staffId);
  assert.equal(primeiro.request_id, REQ1);
  assert.ok(primeiro.contexto.pagamentosPreservados >= 1, 'auditoria prova que nada financeiro sumiu');
});
