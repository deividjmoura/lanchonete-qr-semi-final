'use strict';

// Issue #48 — autoria financeira por identidade.
//
// Antes: sessao_pagamentos guardava só operador_nome (texto). Nome não
// identifica pessoa: renomear a conta quebrava o vínculo e homônimos ficavam
// indistinguíveis. Agora existe operador_id com FK para staff.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do banco descartável');
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname), 'PostgreSQL local/CI obrigatório');
assert.strictEqual(databaseUrl.pathname, '/qradmin_test', 'Banco de teste obrigatório');
assert.strictEqual(process.env.NODE_ENV, 'test', 'NODE_ENV=test obrigatório');

const pool = require('../db/pool');
const caixa = require('../db/caixa');
const auth = require('../db/auth');

const run = crypto.randomUUID().slice(0, 8);
const nomeUnico = `Operador Unico ${run}`;
const nomeDuplicado = `Operador Duplicado ${run}`;
const ids = [];
let mesaId = null;
let sessaoId = null;
let opA = null;
let opB = null;
let produtoId = null;
let categoriaId = null;

test.before(async () => {
  const hash = await auth.hashSenha('Operador-Pagamento-0001');
  const { rows: staff } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, ativo) VALUES
       ($1, $2, $3, 'caixa', TRUE),
       ($4, $5, $3, 'caixa', TRUE),
       ($6, $7, $3, 'caixa', TRUE)
     RETURNING id, nome, login`,
    [
      nomeUnico, `op-unico-${run}`, hash,
      nomeDuplicado, `op-dup-a-${run}`,
      nomeDuplicado, `op-dup-b-${run}`,
    ]
  );
  opA = staff.find((s) => s.login === `op-unico-${run}`);
  opB = staff.find((s) => s.login === `op-dup-a-${run}`);
  ids.push(...staff.map((s) => s.id));

  const { rows: mesa } = await pool.query(
    'INSERT INTO mesas (numero, status) VALUES ((SELECT coalesce(max(numero),0)+1 FROM mesas), $1) RETURNING id',
    ['ocupada']
  );
  mesaId = mesa[0].id;
  const { rows: sess } = await pool.query(
    'INSERT INTO mesa_sessoes (mesa_id, status, valor_total) VALUES ($1, $2, 0) RETURNING id',
    [mesaId, 'aberta']
  );
  sessaoId = sess[0].id;

  // O pagamento é validado contra o consumo da sessão: sem pedido real não há
  // saldo e registrarPagamento recusa com "valor maior que o restante".
  // A fixture é criada aqui: num banco recém-migrado `produtos` está vazio, e
  // depender de sobra de outro teste fazia este arquivo falhar quando rodado
  // sozinho (`prod[0] === undefined`).
  const { rows: categoria } = await pool.query(
    'INSERT INTO categorias (nome) VALUES ($1) RETURNING id',
    [`Categoria pagamento ${run}`]
  );
  categoriaId = categoria[0].id;
  const { rows: prod } = await pool.query(
    'INSERT INTO produtos (categoria_id, nome, preco) VALUES ($1, $2, $3) RETURNING id, preco',
    [categoriaId, `Produto pagamento ${run}`, 5]
  );
  produtoId = prod[0].id;
  const { rows: ped } = await pool.query(
    'INSERT INTO pedidos (sessao_id, status) VALUES ($1, $2) RETURNING id',
    [sessaoId, 'recebido']
  );
  await pool.query(
    `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, status)
     VALUES ($1, $2, 100, $3, 'entregue')`,
    [ped[0].id, prod[0].id, Number(prod[0].preco)]
  );
  const total = Number((100 * Number(prod[0].preco)).toFixed(2));
  await pool.query('UPDATE mesa_sessoes SET valor_total = $2 WHERE id = $1', [sessaoId, total]);
});

test.after(async () => {
  if (sessaoId) {
    await pool.query('DELETE FROM sessao_pagamentos WHERE sessao_id = $1', [sessaoId]);
    await pool.query('DELETE FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id = $1)', [sessaoId]);
    await pool.query('DELETE FROM pedidos WHERE sessao_id = $1', [sessaoId]);
    await pool.query('DELETE FROM mesa_sessoes WHERE id = $1', [sessaoId]);
  }
  if (mesaId) await pool.query('DELETE FROM mesas WHERE id = $1', [mesaId]);
  if (produtoId) await pool.query('DELETE FROM produtos WHERE id = $1', [produtoId]);
  if (categoriaId) await pool.query('DELETE FROM categorias WHERE id = $1', [categoriaId]);
  if (ids.length) {
    await pool.query('UPDATE sessao_pagamentos SET operador_id = NULL WHERE operador_id = ANY($1::int[])', [ids]).catch(() => {});
    await pool.query('DELETE FROM auditoria_eventos WHERE ator_id = ANY($1::int[])', [ids]);
    await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [ids]);
  }
  await pool.end();
});

async function pagamento(sessao, valor, atorId) {
  return caixa.registrarPagamento(
    sessao,
    { valor, formaPagamento: 'dinheiro' },
    `Nome ${atorId}`,
    null,
    { atorTipo: 'staff', atorId, requestId: `req-${atorId}` }
  );
}

test('#48 pagamento grava operador_id além do nome', async () => {
  const out = await pagamento(sessaoId, 5, opA.id);
  assert.ok(out && (out.id || out.pagamento), 'pagamento precisa retornar algo');

  const { rows } = await pool.query(
    'SELECT operador_id, operador_nome FROM sessao_pagamentos WHERE sessao_id = $1 ORDER BY id DESC LIMIT 1',
    [sessaoId]
  );
  assert.equal(rows[0].operador_id, opA.id, 'vínculo por identidade precisa existir');
  assert.equal(rows[0].operador_nome, `Nome ${opA.id}`, 'o retrato do nome continua sendo gravado');
});

test('#48 operador_id sobrevive à renomeação da conta', async () => {
  const { rows: antes } = await pool.query(
    'SELECT operador_id FROM sessao_pagamentos WHERE sessao_id = $1 AND operador_id = $2 LIMIT 1',
    [sessaoId, opA.id]
  );
  assert.ok(antes[0], 'pré-requisito: o pagamento está vinculado');

  // Renomear não pode quebrar o vínculo — era exatamente a falha do nome puro.
  await pool.query('UPDATE staff SET nome = $2 WHERE id = $1', [opA.id, `${nomeUnico} (renomeado)`]);

  const { rows: depois } = await pool.query(
    'SELECT operador_id FROM sessao_pagamentos WHERE sessao_id = $1 AND operador_id = $2 LIMIT 1',
    [sessaoId, opA.id]
  );
  assert.ok(depois[0], 'o vínculo por identidade continua válido depois da renomeação');

  await pool.query('UPDATE staff SET nome = $2 WHERE id = $1', [opA.id, nomeUnico]);
});

test('#48 apagar a conta não apaga o registro financeiro (SET NULL)', async () => {
  const { rows: criado } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, ativo)
     VALUES ($1, $2, $3, 'caixa', TRUE) RETURNING id`,
    [`Descartável ${run}`, `desc-${run}`, 'x'.repeat(64)]
  );
  const tempId = criado[0].id;

  const { rows: pag } = await pool.query(
    `INSERT INTO sessao_pagamentos (sessao_id, valor, forma_pagamento, operador_nome, operador_id)
     VALUES ($1, 1, 'dinheiro', 'Descartável', $2) RETURNING id`,
    [sessaoId, tempId]
  );

  await pool.query('DELETE FROM staff WHERE id = $1', [tempId]);

  const { rows } = await pool.query(
    'SELECT operador_id, operador_nome, valor FROM sessao_pagamentos WHERE id = $1',
    [pag[0].id]
  );
  assert.ok(rows[0], 'o pagamento não pode desaparecer junto com a conta');
  assert.equal(rows[0].operador_id, null, 'o vínculo é anulado, não o registro');
  assert.equal(rows[0].operador_nome, 'Descartável', 'o nome histórico permanece como evidência');
  assert.equal(Number(rows[0].valor), 1);

  await pool.query('DELETE FROM sessao_pagamentos WHERE id = $1', [pag[0].id]);
});

test('#48 backfill vincula apenas quando o nome identifica UMA conta ativa', async () => {
  // Cenário ambíguo: duas contas ativas com o mesmo nome.
  const { rows: amb } = await pool.query(
    `INSERT INTO sessao_pagamentos (sessao_id, valor, forma_pagamento, operador_nome)
     VALUES ($1, 2, 'dinheiro', $2) RETURNING id`,
    [sessaoId, nomeDuplicado]
  );
  // Cenário inequívoco: nome que casa com uma única conta ativa.
  const { rows: unico } = await pool.query(
    `INSERT INTO sessao_pagamentos (sessao_id, valor, forma_pagamento, operador_nome)
     VALUES ($1, 3, 'dinheiro', $2) RETURNING id`,
    [sessaoId, nomeUnico]
  );

  // Reexecuta a mesma lógica do backfill da migration 0038.
  await pool.query(`
    UPDATE sessao_pagamentos p
       SET operador_id = unico.staff_id
      FROM (
            SELECT s.nome AS nome, min(s.id) AS staff_id, count(*) AS total
              FROM staff s WHERE s.ativo GROUP BY s.nome HAVING count(*) = 1
           ) AS unico
     WHERE p.operador_id IS NULL
       AND p.operador_nome IS NOT NULL
       AND btrim(p.operador_nome) <> ''
       AND lower(btrim(p.operador_nome)) = lower(btrim(unico.nome))
  `);

  const { rows: ambiguo } = await pool.query(
    'SELECT operador_id FROM sessao_pagamentos WHERE id = $1', [amb[0].id]
  );
  assert.equal(
    ambiguo[0].operador_id,
    null,
    'nome ambíguo fica SEM vínculo: atribuir no chute produziria prova falsa'
  );

  const { rows: inequivoco } = await pool.query(
    'SELECT operador_id FROM sessao_pagamentos WHERE id = $1', [unico[0].id]
  );
  assert.equal(inequivoco[0].operador_id, opA.id, 'nome inequívoco é vinculado');

  await pool.query('DELETE FROM sessao_pagamentos WHERE id = ANY($1::int[])', [[amb[0].id, unico[0].id]]);
});

test('#48 lançamento sem ator não inventa operador', async () => {
  const { rows: sem } = await pool.query(
    `INSERT INTO sessao_pagamentos (sessao_id, valor, forma_pagamento)
     VALUES ($1, 4, 'dinheiro') RETURNING id, operador_id, operador_nome`,
    [sessaoId]
  );
  assert.equal(sem[0].operador_id, null);
  assert.equal(sem[0].operador_nome, null);

  const { rows: balcao } = await pool.query(
    'SELECT operador_id, operador_nome FROM sessao_pagamentos WHERE id = $1', [sem[0].id]
  );
  assert.equal(balcao[0].operador_id, null);

  await pool.query('DELETE FROM sessao_pagamentos WHERE id = $1', [sem[0].id]);
});

test('#48 ator que não é staff não é vinculado a staff por coincidência de id', async () => {
  // atorId de garçom é id de `garcons`, não de `staff`. Gravar esse número em
  // operador_id apontaria para OUTRA pessoa (ou violaria a FK). A autoria do
  // garçom fica em auditoria_eventos.ator_id, polimórfica por ator_tipo.
  const pagamento = await caixa.registrarPagamento(sessaoId, {
    valor: 1, formaPagamento: 'dinheiro', idempotencyKey: crypto.randomUUID(),
  }, 'Garçom Sem Conta', null, { atorTipo: 'garcom', atorId: 999999, requestId: 'qa-garcom-sem-staff' });

  const { rows } = await pool.query(
    'SELECT operador_id FROM sessao_pagamentos WHERE id = $1', [pagamento.pagamento.id]
  );
  assert.equal(rows[0].operador_id, null, 'id de garçom não pode virar autoria de staff');
  assert.equal(pagamento.pagamento.operadorNome, 'Garçom Sem Conta', 'o nome continua registrado');

  await pool.query('DELETE FROM sessao_pagamentos WHERE id = $1', [pagamento.pagamento.id]);
});
