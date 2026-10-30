// Issue #47: ciclo de vida do QR fixo e abertura de sessão.
// Roda apenas no workflow com PostgreSQL 16 descartável; usa somente
// identificadores sintéticos criados e removidos pelo próprio teste.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Este teste deve rodar apenas contra o PostgreSQL descartável do CI');

const pool = require('../db/pool');
const pedidos = require('../db/pedidos');

test('QR fixo: pedido após fechamento abre NOVA sessão; token inválido é rejeitado', async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname));
  assert.equal(databaseUrl.pathname, '/qradmin_test');
  assert.equal(process.env.NODE_ENV, 'test');

  const version = await pool.query('SHOW server_version');
  const major = Number.parseInt(String(version.rows[0].server_version), 10);
  assert.ok(Number.isInteger(major) && major >= 16, 'Integração exige PostgreSQL 16 ou superior');

  const suffix = randomUUID().slice(0, 8);
  const token = randomUUID();
  const ids = { mesa: null, sessoes: [], categoria: null, produto: null };

  try {
    ids.categoria = (await pool.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
      ['QR sessão CI ' + suffix]
    )).rows[0].id;
    ids.produto = (await pool.query(
      `INSERT INTO produtos (categoria_id, nome, preco, disponivel, controla_estoque, estoque)
       VALUES ($1, $2, 8.4, TRUE, TRUE, 10) RETURNING id`,
      [ids.categoria, 'Produto QR ' + suffix]
    )).rows[0].id;
    ids.mesa = (await pool.query(
      'INSERT INTO mesas (numero, token, status) VALUES ($1, $2, $3) RETURNING id',
      [910000 + Math.floor(Math.random() * 80000), token, 'livre']
    )).rows[0].id;

    // 1) Primeiro pedido via QR cria a sessão (política atual: QR fixo sempre
    //    ativo e a primeira comanda abre a sessão, sem ação de funcionário).
    const primeiro = await pedidos.criarPedido(token, {
      idempotencyKey: 'qr-' + randomUUID(),
      items: [{ productId: ids.produto, qty: 1 }],
    });
    assert.equal(primeiro.idempotentReplay, false);
    const sessaoA = primeiro.sessaoId;
    ids.sessoes.push(sessaoA);
    let mesaRow = await pool.query('SELECT status FROM mesas WHERE id = $1', [ids.mesa]);
    assert.equal(mesaRow.rows[0].status, 'ocupada');

    // 2) Fechamento da conta (simulado no nível de sessão, como o caixa faz):
    //    sessão fechada e mesa livre.
    await pool.query(
      "UPDATE mesa_sessoes SET status = 'fechada', fechada_em = now() WHERE id = $1",
      [sessaoA]
    );
    await pool.query("UPDATE mesas SET status = 'livre' WHERE id = $1", [ids.mesa]);

    // 3) O MESMO token (QR fotográfico/fixo) volta a abrir uma sessão nova.
    const segundo = await pedidos.criarPedido(token, {
      idempotencyKey: 'qr-' + randomUUID(),
      items: [{ productId: ids.produto, qty: 2 }],
    });
    assert.notEqual(segundo.sessaoId, sessaoA, 'o segundo pedido precisa abrir outra sessão');
    ids.sessoes.push(segundo.sessaoId);
    const sessoes = await pool.query(
      'SELECT id, status FROM mesa_sessoes WHERE mesa_id = $1 ORDER BY id',
      [ids.mesa]
    );
    assert.equal(sessoes.rowCount, 2);
    assert.deepEqual(sessoes.rows.map((r) => r.status), ['fechada', 'aberta']);
    mesaRow = await pool.query('SELECT status FROM mesas WHERE id = $1', [ids.mesa]);
    assert.equal(mesaRow.rows[0].status, 'ocupada');

    // 4) Token malformado ou desconhecido não encontra mesa (404), sem mutação.
    await assert.rejects(
      () => pedidos.criarPedido('nao-e-uuid', {
        idempotencyKey: 'qr-' + randomUUID(),
        items: [{ productId: ids.produto, qty: 1 }],
      }),
      (e) => e.status === 404
    );
    await assert.rejects(
      () => pedidos.criarPedido(randomUUID(), {
        idempotencyKey: 'qr-' + randomUUID(),
        items: [{ productId: ids.produto, qty: 1 }],
      }),
      (e) => e.status === 404
    );

    // 5) O modelo atual não tem mesa "desativada": o CHECK da coluna só
    //    permite livre/ocupada. A proteção contra pedidos remotos, se a
    //    política mudar, exigirá nova coluna/fluxo (ver docs/engineering).
    const check = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS definicao
         FROM pg_constraint
        WHERE conrelid = 'mesas'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'`
    );
    assert.ok(check.rows.some((r) => /'livre'/.test(r.definicao) && /'ocupada'/.test(r.definicao)));
  } finally {
    for (const sessaoId of ids.sessoes) {
      await pool.query('DELETE FROM auditoria_eventos WHERE alvo_id = $1', [String(sessaoId)]).catch(() => {});
      await pool.query('DELETE FROM itens_pedido_adicionais WHERE item_pedido_id IN (SELECT id FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id = $1))', [sessaoId]).catch(() => {});
      await pool.query('DELETE FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id = $1)', [sessaoId]).catch(() => {});
      await pool.query('DELETE FROM pedidos WHERE sessao_id = $1', [sessaoId]).catch(() => {});
    }
    await pool.query('DELETE FROM mesa_sessoes WHERE mesa_id = $1', [ids.mesa]).catch(() => {});
    if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id = $1', [ids.mesa]).catch(() => {});
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id = $1', [ids.produto]).catch(() => {});
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id = $1', [ids.categoria]).catch(() => {});
    await pool.end();
  }
});
