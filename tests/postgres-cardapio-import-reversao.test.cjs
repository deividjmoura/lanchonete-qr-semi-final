'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || 'http://ausente');
assert.equal(url.pathname, '/qradmin_test');
assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(url.hostname));
assert.equal(process.env.NODE_ENV, 'test');
const pool = require('../db/pool');
const { importarCardapio } = require('../db/cardapio-import');
const { reverterCardapio, statusReversao } = require('../db/cardapio-reversao');
const nome = `CSV-${randomUUID().slice(0, 8)}`;
const csv = (nomeProduto, estoque = '0') => `categoria;nome;preco;disponivel;estoque\n${nome};${nomeProduto};15;sim;${estoque}`;
let categoria, produto, snapshotAnterior;
test.before(async () => {
  snapshotAnterior = (await pool.query('SELECT * FROM cardapio_import_reversao WHERE id=1')).rows[0];
  categoria = (await pool.query('INSERT INTO categorias (nome,ordem) VALUES ($1,0) RETURNING id', [nome])).rows[0].id;
  produto = (await pool.query(`INSERT INTO produtos (categoria_id,nome,preco,disponivel,controla_estoque,estoque)
    VALUES ($1,'Original',10,TRUE,TRUE,9) RETURNING id`, [categoria])).rows[0].id;
});
test.after(async () => {
  await pool.query('DELETE FROM produtos WHERE categoria_id=$1', [categoria]);
  await pool.query('DELETE FROM categorias WHERE id=$1', [categoria]);
  await pool.query('DELETE FROM cardapio_import_reversao WHERE id=1');
  if (snapshotAnterior) await pool.query(`INSERT INTO cardapio_import_reversao
    (id,versao,anterior,posterior,criado_em,revertido_em) VALUES (1,$1,$2,$3,$4,$5)`,
  [snapshotAnterior.versao, snapshotAnterior.anterior, snapshotAnterior.posterior, snapshotAnterior.criado_em, snapshotAnterior.revertido_em]);
  await pool.end();
});

test('CSV zero, atualização, snapshot persistente, rollback e reversão protegida', async (t) => {
  await t.test('substituir cria controle com zero; reverter restaura IDs, dados e adicionais', async () => {
    const adicional = (await pool.query("INSERT INTO adicionais (produto_id,nome,preco) VALUES ($1,'Extra',2) RETURNING id", [produto])).rows[0].id;
    const out = await importarCardapio({ texto: csv('Novo') });
    const novo = (await pool.query("SELECT * FROM produtos WHERE categoria_id=$1 AND arquivado=FALSE", [categoria])).rows[0];
    assert.equal(novo.estoque, 0); assert.equal(novo.controla_estoque, true);
    assert.equal((await statusReversao()).versao, out.versao);
    await reverterCardapio({ versao: out.versao });
    const original = (await pool.query('SELECT * FROM produtos WHERE id=$1', [produto])).rows[0];
    assert.equal(original.arquivado, false); assert.equal(original.estoque, 9);
    assert.equal(original.preco, '10.00');
    assert.equal((await pool.query('SELECT id FROM adicionais WHERE id=$1', [adicional])).rowCount, 1);
    assert.equal((await pool.query('SELECT arquivado FROM produtos WHERE id=$1', [novo.id])).rows[0].arquivado, true);
    await assert.rejects(() => reverterCardapio({ versao: out.versao }), { status: 409 });
  });
  await t.test('atualizar sem estoque preserva saldo; zero define saldo e é reversível', async () => {
    const out = await importarCardapio({ texto: csv('Original', ''), modo: 'atualizar' });
    assert.equal((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [produto])).rows[0].estoque, 9);
    await reverterCardapio({ versao: out.versao });
    const zero = await importarCardapio({ texto: csv('Original', '0'), modo: 'atualizar' });
    assert.equal((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [produto])).rows[0].estoque, 0);
    await reverterCardapio({ versao: zero.versao });
  });
  await t.test('alteração/baixa após importação bloqueia reversão sem perder saldo', async () => {
    const out = await importarCardapio({ texto: csv('Original', '12'), modo: 'atualizar' });
    await pool.query('UPDATE produtos SET estoque=estoque-1 WHERE id=$1', [produto]);
    await assert.rejects(() => reverterCardapio({ versao: out.versao }), { status: 409 });
    assert.equal((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [produto])).rows[0].estoque, 11);
    await pool.query('UPDATE produtos SET estoque=12 WHERE id=$1', [produto]);
    await assert.rejects(() => reverterCardapio({ versao: out.versao }), { status: 409 });
    // Restaura a fixture para os próximos cenários; o snapshot invalidado não pode mais reverter.
    await pool.query('UPDATE produtos SET estoque=9, preco=10 WHERE id=$1', [produto]);
  });
  await t.test('falha ao guardar snapshot reverte também a importação', async () => {
    const conectar = pool.connect.bind(pool);
    pool.connect = async () => {
      const c = await conectar();
      return { release: () => c.release(), query: (sql, args) => {
        if (sql.includes('INSERT INTO cardapio_import_reversao')) throw Error('Falha snapshot');
        return c.query(sql, args);
      } };
    };
    try { await assert.rejects(() => importarCardapio({ texto: csv('Original', '17'), modo: 'atualizar' }), /Falha snapshot/); }
    finally { pool.connect = conectar; }
    assert.equal((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [produto])).rows[0].estoque, 9);
  });
  await t.test('duas reversões simultâneas: somente uma confirma', async () => {
    const out = await importarCardapio({ texto: csv('Original', '4'), modo: 'atualizar' });
    const results = await Promise.allSettled([reverterCardapio({ versao: out.versao }), reverterCardapio({ versao: out.versao })]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
  });
  await t.test('snapshot mais recente substitui o anterior, sem reverter importação errada', async () => {
    const primeira = await importarCardapio({ texto: csv('Original', '4'), modo: 'atualizar' });
    const segunda = await importarCardapio({ texto: csv('Original', '6'), modo: 'atualizar' });
    await assert.rejects(() => reverterCardapio({ versao: primeira.versao }), { status: 409 });
    await reverterCardapio({ versao: segunda.versao });
    assert.equal((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [produto])).rows[0].estoque, 4);
    await pool.query('UPDATE produtos SET estoque=9,preco=10 WHERE id=$1', [produto]);
  });
  await t.test('falha no meio da restauração dá rollback e mantém ponto utilizável', async () => {
    const out = await importarCardapio({ texto: csv('Original', '7'), modo: 'atualizar' });
    const conectar = pool.connect.bind(pool);
    pool.connect = async () => {
      const c = await conectar();
      return { release: () => c.release(), query: (sql, args) => {
        if (sql.includes('UPDATE produtos SET categoria_id=')) throw Error('Falha reversão');
        return c.query(sql, args);
      } };
    };
    try { await assert.rejects(() => reverterCardapio({ versao: out.versao }), /Falha reversão/); }
    finally { pool.connect = conectar; }
    assert.equal((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [produto])).rows[0].estoque, 7);
    assert.equal((await statusReversao()).disponivel, true);
    await reverterCardapio({ versao: out.versao });
    assert.equal((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [produto])).rows[0].estoque, 9);
  });
  await t.test('HTTP real exige admin/CSRF/confirmação e audita a reversão', async () => {
    const auth = require('../db/auth');
    const { subirServidor } = require('./helpers/public-table-server.cjs');
    const servidor = await subirServidor();
    const contas = [];
    try {
      const criarSessao = async (papel) => {
        const { rows } = await pool.query(`INSERT INTO staff (nome,login,senha_hash,papel,ativo,deve_trocar_senha)
          VALUES ($1,$2,$3,$4,TRUE,FALSE) RETURNING id`,
        [nome, `${nome}-${papel}`, await auth.hashSenha('senha-ficticia-CSV-2026'), papel]);
        contas.push(rows[0].id);
        const token = await auth.criarSessao(rows[0].id);
        return { cookie: `${auth.SESSION_COOKIE}=${token}`, 'x-csrf-token': auth.csrfTokenParaSessao(token), origin: servidor.base };
      };
      const admin = await criarSessao('admin'), caixa = await criarSessao('caixa');
      const path = '/api/admin/cardapio/reverter';
      assert.equal((await servidor.request('POST', path, { corpo: {} })).status, 401);
      assert.equal((await servidor.request('POST', path, { headers: caixa, corpo: {} })).status, 403);
      assert.equal((await servidor.request('POST', path, { headers: { ...admin, 'x-csrf-token': 'errado' }, corpo: {} })).status, 403);
      assert.equal((await servidor.request('POST', path, { headers: admin, corpo: {} })).status, 400);
      const imp = await servidor.request('POST', '/api/admin/cardapio/importar', {
        headers: admin, corpo: { csv: csv('Original', '0'), modo: 'atualizar', confirmar: true },
      });
      assert.equal(imp.status, 200, imp.texto);
      const status = await servidor.request('GET', '/api/admin/cardapio/reversao', { headers: admin });
      assert.equal(status.json.versao, imp.json.versao);
      assert.equal(status.json.anterior, undefined, 'snapshot privado não é exposto na rota de estado');
      const revert = await servidor.request('POST', path, {
        headers: admin, corpo: { versao: imp.json.versao, confirmar: true },
      });
      assert.equal(revert.status, 200, revert.texto);
      const audit = await pool.query("SELECT * FROM auditoria_eventos WHERE acao='cardapio_importacao_revertida' AND ator_id=$1", [contas[0]]);
      assert.equal(audit.rowCount, 1);
      assert.equal(audit.rows[0].contexto.versao, imp.json.versao);
      assert.equal((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [produto])).rows[0].estoque, 9);
    } finally {
      await servidor.encerrar();
      await pool.query('DELETE FROM auditoria_eventos WHERE ator_id=ANY($1::int[])', [contas]);
      await pool.query('DELETE FROM staff_sessoes WHERE staff_id=ANY($1::int[])', [contas]);
      await pool.query('DELETE FROM staff WHERE id=ANY($1::int[])', [contas]);
    }
  });

});
