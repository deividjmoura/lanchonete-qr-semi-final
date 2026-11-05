'use strict';

// Issue #48 — autoria persistente das mutações de cardápio.
//
// Antes: produto, adicional, ordenação e remoção eram alterados sem nenhuma
// trilha de quem fez. A issue exigia que produto, adicional e reordenação
// seguissem o mesmo padrão já usado em categoria: ator identificado, evento na
// MESMA transação da operação.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do banco descartável');
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname), 'PostgreSQL local/CI obrigatório');
assert.strictEqual(databaseUrl.pathname, '/qradmin_test', 'Banco de teste obrigatório');
assert.strictEqual(process.env.NODE_ENV, 'test', 'NODE_ENV=test obrigatório');

const pool = require('../db/pool');
const admin = require('../db/admin');
const auth = require('../db/auth');

const run = crypto.randomUUID().slice(0, 8);
let adminAtivo = null;
let adminInativo = null;
let categoriaId = null;
const produtosCriados = [];

test.before(async () => {
  const hash = await auth.hashSenha('Ator-Cardapio-0001');
  const { rows } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, ativo)
     VALUES ($1, $2, $3, 'admin', TRUE), ($4, $5, $3, 'admin', FALSE)
     RETURNING id, nome, login, ativo`,
    [`Admin cardápio ${run}`, `admin-card-${run}`, hash, `Admin inativo ${run}`, `admin-off-${run}`]
  );
  adminAtivo = rows.find((r) => r.ativo);
  adminInativo = rows.find((r) => !r.ativo);

  const { rows: cat } = await pool.query(
    'INSERT INTO categorias (nome, ordem) VALUES ($1, 999) RETURNING id',
    [`Cat autoria ${run}`]
  );
  categoriaId = cat[0].id;
});

test.after(async () => {
  if (categoriaId) {
    // Apaga tudo que ficou na categoria do teste, inclusive resíduos de
    // tentativas anteriores — a FK é RESTRICT e o cleanup precisa ser completo.
    await pool.query(
      `DELETE FROM produtos_ingredientes_removiveis WHERE produto_id IN (SELECT id FROM produtos WHERE categoria_id = $1)`,
      [categoriaId]
    );
    await pool.query(
      `DELETE FROM adicionais WHERE produto_id IN (SELECT id FROM produtos WHERE categoria_id = $1)`,
      [categoriaId]
    );
    await pool.query('DELETE FROM produtos WHERE categoria_id = $1', [categoriaId]);
    await pool.query('DELETE FROM categorias WHERE id = $1', [categoriaId]);
  }
  const ids = [adminAtivo?.id, adminInativo?.id].filter(Boolean);
  if (ids.length) {
    await pool.query('DELETE FROM auditoria_eventos WHERE ator_id = ANY($1::int[])', [ids]);
    await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [ids]);
  }
  await pool.end();
});

async function eventos(acao, alvoId) {
  const { rows } = await pool.query(
    `SELECT ator_tipo, ator_id, ator_nome, request_id, contexto
       FROM auditoria_eventos
      WHERE acao = $1 AND alvo_id = $2
      ORDER BY id DESC`,
    [acao, String(alvoId)]
  );
  return rows;
}

test('#48 criar produto grava autor na mesma transação', async () => {
  const produto = await admin.criarProduto(
    { nome: `Produto autoria ${run}`, categoriaId, preco: 12.5 },
    adminAtivo,
    `req-create-${run}`
  );
  produtosCriados.push(produto.id);

  const ev = await eventos('produto_criado', produto.id);
  assert.equal(ev.length, 1, 'precisa existir exatamente um evento de criação');
  assert.equal(ev[0].ator_tipo, 'staff');
  assert.equal(ev[0].ator_id, adminAtivo.id);
  assert.equal(ev[0].ator_nome, adminAtivo.nome);
  assert.equal(ev[0].request_id, `req-create-${run}`);
  assert.equal(ev[0].contexto.nome, `Produto autoria ${run}`);
});

test('#48 atualizar produto registra autor e o preço de antes e depois', async () => {
  const produto = await admin.criarProduto(
    { nome: `Produto preço ${run}`, categoriaId, preco: 10 },
    adminAtivo,
    `req-c-${run}`
  );
  produtosCriados.push(produto.id);

  await admin.atualizarProduto(produto.id, { preco: 18.9 }, adminAtivo, `req-upd-${run}`);

  const ev = await eventos('produto_atualizado', produto.id);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].ator_id, adminAtivo.id);
  assert.equal(ev[0].request_id, `req-upd-${run}`);
  assert.equal(Number(ev[0].contexto.precoAnterior), 10);
  assert.equal(Number(ev[0].contexto.precoNovo), 18.9);
});

test('#48 criar e remover adicional gravam autor', async () => {
  const produto = await admin.criarProduto(
    { nome: `Produto adicional ${run}`, categoriaId, preco: 20 },
    adminAtivo,
    `req-c2-${run}`
  );
  produtosCriados.push(produto.id);

  const ad = await admin.criarAdicional(produto.id, { nome: 'Bacon extra', preco: 4 }, adminAtivo, `req-ad-${run}`);
  const evCriar = await eventos('adicional_criado', ad.id);
  assert.equal(evCriar.length, 1);
  assert.equal(evCriar[0].ator_id, adminAtivo.id);
  assert.equal(Number(evCriar[0].contexto.preco), 4);

  await admin.removerAdicional(ad.id, adminAtivo, `req-adrm-${run}`);
  const evRemover = await eventos('adicional_removido', ad.id);
  assert.equal(evRemover.length, 1, 'a remoção não pode apagar a própria evidência');
  assert.equal(evRemover[0].ator_id, adminAtivo.id);
  assert.equal(evRemover[0].contexto.nome, 'Bacon extra');
});

test('#48 reordenar produtos grava autor', async () => {
  const a = await admin.criarProduto({ nome: `Ord A ${run}`, categoriaId, preco: 5 }, adminAtivo, null);
  const b = await admin.criarProduto({ nome: `Ord B ${run}`, categoriaId, preco: 5 }, adminAtivo, null);
  produtosCriados.push(a.id, b.id);

  const { rows } = await pool.query('SELECT id FROM produtos WHERE categoria_id = $1', [categoriaId]);
  const ids = rows.map((r) => r.id);
  await admin.reordenarProdutos(categoriaId, ids, adminAtivo, `req-ord-${run}`);

  const ev = await eventos('produtos_reordenados', categoriaId);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].ator_id, adminAtivo.id);
  assert.equal(ev[0].request_id, `req-ord-${run}`);
  assert.equal(Number(ev[0].contexto.quantidade), ids.length);
});

test('#48 admin INATIVO é recusado', async () => {
  await assert.rejects(
    () => admin.criarProduto({ nome: `Inativo ${run}`, categoriaId, preco: 1 }, adminInativo, null),
    (e) => e.status === 403,
    'conta desativada não pode alterar o cardápio'
  );
});

test('#48 ator ausente é registrado como sistema, não inventado como staff', async () => {
  // Compatibilidade deliberada, igual à de categoria: chamadas internas
  // (importação de cardápio, scripts) não têm sessão. O evento registra
  // 'sistema' — que é honesto — em vez de atribuir a alguém que não agiu.
  // As ROTAS continuam exigindo admin via exigirAcesso antes de chegar aqui.
  const produto = await admin.criarProduto(
    { nome: `Sem ator ${run}`, categoriaId, preco: 3 },
    null,
    null
  );
  produtosCriados.push(produto.id);

  const ev = await eventos('produto_criado', produto.id);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].ator_tipo, 'sistema');
  assert.equal(ev[0].ator_id, null);
  assert.equal(ev[0].ator_nome, null);
});

test('#48 estado é preservado quando o ator é inválido (transação não deixa resíduo)', async () => {
  const antes = (await pool.query(
    'SELECT count(*)::int AS n FROM produtos WHERE categoria_id = $1',
    [categoriaId]
  )).rows[0].n;

  await assert.rejects(
    () => admin.criarProduto({ nome: `Fantasma ${run}`, categoriaId, preco: 9 }, adminInativo, null),
    (e) => e.status === 403
  );

  const depois = (await pool.query(
    'SELECT count(*)::int AS n FROM produtos WHERE categoria_id = $1',
    [categoriaId]
  )).rows[0].n;
  assert.equal(depois, antes, 'a recusa não pode ter criado produto');
});
