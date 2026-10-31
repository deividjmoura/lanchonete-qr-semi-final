'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL descartável');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(url.hostname), 'PostgreSQL local/CI obrigatório');
assert.equal(url.pathname, '/qradmin_test', 'Banco de teste obrigatório');
assert.equal(process.env.NODE_ENV, 'test', 'NODE_ENV=test obrigatório');

const pool = require('../db/pool');
const { paginaComprovantes, listarComprovantesRecentes } = require('../db/comprovante');
const { listPedidosRecentes } = require('../db/garcons');
const { lerCursor, limitePagina, validarPeriodo } = require('../db/paginacao');
test.after(() => pool.end());

async function fixture() {
  const tag = randomUUID().slice(0, 8);
  const ids = { mesa: null, sessoes: [], pedidos: [], categoria: null, produto: null };
  const numero = 100000 + Math.floor(Math.random() * 800000);
  ids.mesa = (await pool.query('INSERT INTO mesas(numero) VALUES($1) RETURNING id', [numero])).rows[0].id;
  const limpar = async () => {
    if (ids.pedidos.length) await pool.query('DELETE FROM pedidos WHERE id=ANY($1::int[])', [ids.pedidos]);
    if (ids.sessoes.length) await pool.query('DELETE FROM mesa_sessoes WHERE id=ANY($1::int[])', [ids.sessoes]);
    if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id=$1', [ids.mesa]);
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id=$1', [ids.produto]);
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id=$1', [ids.categoria]);
  };
  return { ids, tag, limpar };
}

test('comprovantes percorrem mais de 25, desempates e datas nulas sem duplicar mesmo com inserção', async () => {
  const f = await fixture();
  try {
    const inseridos = await pool.query(`
      INSERT INTO mesa_sessoes(mesa_id,status,fechada_em,valor_total,cliente_nome)
      SELECT $1,'fechada', CASE WHEN n <= 3 THEN NULL
        WHEN n <= 13 THEN '2040-02-01 12:00:00.123456+00'::timestamptz
        ELSE '2040-02-01 12:00:00.123456+00'::timestamptz + n * interval '1 microsecond' END,
        n, $2 FROM generate_series(1,38) n RETURNING id`, [f.ids.mesa, `Fixture ${f.tag}`]);
    f.ids.sessoes.push(...inseridos.rows.map((r) => r.id));
    const esperado = (await pool.query(`SELECT id FROM mesa_sessoes WHERE status='fechada'
      ORDER BY fechada_em DESC NULLS LAST,id DESC`)).rows.map((r) => r.id);

    const primeira = await paginaComprovantes({ limite: '5' });
    assert.equal(primeira.itens.length, 5);
    assert.ok(primeira.proximoCursor);
    assert.equal(lerCursor(primeira.proximoCursor, 'comprovantes').data.endsWith('Z'), true);
    const novo = await pool.query(`INSERT INTO mesa_sessoes(mesa_id,status,fechada_em,valor_total)
      VALUES($1,'fechada','2099-01-01T12:00:00Z',5) RETURNING id`, [f.ids.mesa]);
    f.ids.sessoes.push(novo.rows[0].id);
    let cursor = primeira.proximoCursor;
    const vistos = primeira.itens.map((x) => x.id);
    while (cursor) {
      const pagina = await paginaComprovantes({ limite: '5', cursor });
      assert.ok(pagina.itens.length <= 5);
      vistos.push(...pagina.itens.map((x) => x.id));
      cursor = pagina.proximoCursor;
    }
    assert.deepEqual(vistos, esperado, 'nenhum registro foi perdido ao inserir uma conta mais recente');
    assert.equal(new Set(vistos).size, vistos.length);
    assert.ok(f.ids.sessoes.slice(0, -1).every((id) => vistos.includes(id)));
    assert.equal(vistos.includes(novo.rows[0].id), false, 'a atualização traz a nova conta no início');
    assert.equal((await paginaComprovantes({ limite: '5' })).itens[0].id, novo.rows[0].id);
    const legado = await listarComprovantesRecentes();
    assert.ok(Array.isArray(legado) && legado.length <= 25, 'contrato legado continua sendo array limitado a 25');
  } finally { await f.limpar(); }
});

test('histórico percorre mais de 200 pedidos preservando precisão de microssegundos, filtros e itens', async () => {
  const f = await fixture();
  try {
    const sessao = (await pool.query("INSERT INTO mesa_sessoes(mesa_id,status) VALUES($1,'fechada') RETURNING id", [f.ids.mesa])).rows[0];
    f.ids.sessoes.push(sessao.id);
    f.ids.categoria = (await pool.query('INSERT INTO categorias(nome,ordem) VALUES($1,0) RETURNING id', [`Categoria ${f.tag}`])).rows[0].id;
    f.ids.produto = (await pool.query('INSERT INTO produtos(categoria_id,nome,preco) VALUES($1,$2,12) RETURNING id', [f.ids.categoria, `Produto ${f.tag}`])).rows[0].id;
    const pedidos = await pool.query(`INSERT INTO pedidos(sessao_id,status,cliente_nome,criado_em)
      SELECT $1,'entregue',$2,'2041-03-05 12:00:00.123000+00'::timestamptz + (n / 3) * interval '1 microsecond'
      FROM generate_series(1,215) n RETURNING id`, [sessao.id, `Pedido ${f.tag}`]);
    f.ids.pedidos.push(...pedidos.rows.map((r) => r.id));
    await pool.query(`INSERT INTO itens_pedido(pedido_id,produto_id,quantidade,preco_unitario,status)
      SELECT unnest($1::int[]),$2,2,12,'entregue'`, [f.ids.pedidos, f.ids.produto]);
    const esperado = (await pool.query(`SELECT id FROM pedidos WHERE id=ANY($1::int[])
      ORDER BY criado_em DESC,id DESC`, [f.ids.pedidos])).rows.map((r) => r.id);
    const filtros = { from: '2041-03-05', to: '2041-03-05', paginado: true, limit: '10' };
    const primeira = await listPedidosRecentes(filtros);
    assert.equal(primeira.itens.length, 10);
    assert.ok(primeira.proximoCursor);
    assert.equal(primeira.itens[0].itens[0].quantidade, 2);
    assert.equal(primeira.itens[0].totalPedido, 24);
    assert.equal('cursor_data' in primeira.itens[0], false);
    const novo = (await pool.query(`INSERT INTO pedidos(sessao_id,status,criado_em)
      VALUES($1,'entregue','2041-03-05 18:00:00Z') RETURNING id`, [sessao.id])).rows[0];
    f.ids.pedidos.push(novo.id);
    const vistos = primeira.itens.map((x) => x.id);
    let cursor = primeira.proximoCursor;
    while (cursor) {
      const pagina = await listPedidosRecentes({ ...filtros, cursor });
      assert.ok(pagina.itens.length <= 10);
      vistos.push(...pagina.itens.map((x) => x.id));
      cursor = pagina.proximoCursor;
    }
    assert.deepEqual(vistos, esperado);
    assert.equal(new Set(vistos).size, 215);
    assert.equal((await listPedidosRecentes(filtros)).itens[0].id, novo.id);
    const vazio = await listPedidosRecentes({ ...filtros, from: '2041-03-06', to: '2041-03-06' });
    assert.deepEqual(vazio, { itens: [], proximoCursor: null });
    await assert.rejects(() => listPedidosRecentes({ ...filtros, from: '2041-03-04', cursor: primeira.proximoCursor }), (e) => e.status === 400);
    await assert.rejects(() => paginaComprovantes({ cursor: primeira.proximoCursor }), (e) => e.status === 400);
    const legado = await listPedidosRecentes({ from: filtros.from, to: filtros.to, limit: 3 });
    assert.equal(legado.length, 3, 'clientes legados continuam recebendo array');
    assert.equal('cursor_data' in legado[0], false);
  } finally { await f.limpar(); }
});

test('limites, datas e cursores malformados são rejeitados com 400', async () => {
  for (const limite of ['', '0', '-1', '1.2', '51', '999999999999999999999']) {
    assert.throws(() => limitePagina(limite), (e) => e.status === 400);
  }
  for (const cursor of ['', 'not-json', '!@#', 'a'.repeat(513)]) {
    await assert.rejects(() => paginaComprovantes({ cursor }), (e) => e.status === 400);
  }
  for (const [from, to] of [['2041-02-29', '2041-03-01'], ['2041-04-02', '2041-04-01'], ['x', null]]) {
    assert.throws(() => validarPeriodo(from, to), (e) => e.status === 400);
  }
  assert.equal(limitePagina(null, 5), 5);
  assert.deepEqual(validarPeriodo(null, null), { from: null, to: null });
});
