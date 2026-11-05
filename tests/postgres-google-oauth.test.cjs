'use strict';

// Integração real da migration 0034 e das garantias de unicidade do vínculo Google.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

assert.equal(new URL(process.env.DATABASE_URL || 'postgres://x/none').pathname, '/qradmin_test',
  'Integração bloqueada: database deve ser qradmin_test');

const pool = require('../db/pool');
const { removerEmailGoogleStaff, definirEmailGoogleStaff } = require('../db/admin');
const run = `oauth${process.pid}${crypto.randomBytes(4).toString('hex')}`;
const ids = [];

async function criarStaff(sufixo, email = null, papel = 'caixa') {
  const login = `${run}-${sufixo}`;
  const { rows } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, email)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [`OAuth ${sufixo}`, login, `hash-ficticio-${login}`, papel, email]
  );
  ids.push(rows[0].id);
  return rows[0].id;
}

test.after(async () => {
  if (ids.length) await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [ids]);
  await pool.end();
});

test('PostgreSQL real: migration 0034 cria colunas e índices únicos de e-mail e Google sub', async () => {
  const columns = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'staff'
        AND column_name IN ('email', 'google_sub')`
  );
  assert.deepEqual(columns.rows.map((row) => row.column_name).sort(), ['email', 'google_sub']);

  const a = await criarStaff('email-a', 'OAuth.Teste@Example.com');
  await assert.rejects(
    () => criarStaff('email-b', 'oauth.teste@example.com'),
    (error) => error.code === '23505',
    'e-mail deve ser único sem diferenciar maiúsculas/minúsculas'
  );

  await pool.query('UPDATE staff SET google_sub = $2 WHERE id = $1', [a, `sub-${run}`]);
  const b = await criarStaff('sub-b', 'outro-${run}@example.com');
  await assert.rejects(
    () => pool.query('UPDATE staff SET google_sub = $2 WHERE id = $1', [b, `sub-${run}`]),
    (error) => error.code === '23505',
    'o mesmo Google sub não pode pertencer a dois funcionários'
  );
});

test('PostgreSQL real: duas contas concorrentes não conseguem reivindicar o mesmo Google sub', async () => {
  const a = await criarStaff('conc-a', `conc-a-${run}@example.com`);
  const b = await criarStaff('conc-b', `conc-b-${run}@example.com`);
  const sub = `sub-concorrente-${run}`;
  const results = await Promise.allSettled([
    pool.query('UPDATE staff SET google_sub = $2 WHERE id = $1', [a, sub]),
    pool.query('UPDATE staff SET google_sub = $2 WHERE id = $1', [b, sub]),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason?.code === '23505').length, 1);
  const owners = await pool.query('SELECT id FROM staff WHERE google_sub = $1', [sub]);
  assert.equal(owners.rowCount, 1);
});


test('PostgreSQL real: admin remove e-mail pré-autorizado com auditoria na mesma transação', async () => {
  const adminId = await criarStaff('remove-admin', null, 'admin');
  const alvoId = await criarStaff('remove-alvo', `remove-${run}@example.com`);
  const requestId = `req-remove-${run}`;

  const atualizado = await removerEmailGoogleStaff(alvoId, { id: adminId }, requestId);
  assert.equal(Number(atualizado.id), alvoId);
  assert.equal(atualizado.email, null);

  const evento = await pool.query(
    `SELECT ator_id, alvo_id, acao, request_id, contexto
       FROM auditoria_eventos WHERE request_id = $1`,
    [requestId]
  );
  assert.equal(evento.rowCount, 1);
  assert.equal(Number(evento.rows[0].ator_id), adminId);
  assert.equal(evento.rows[0].alvo_id, String(alvoId));
  assert.equal(evento.rows[0].acao, 'email_google_removido');
  assert.deepEqual(evento.rows[0].contexto, { emailRemovido: true, googleVinculado: false });
});

test('PostgreSQL real: remoção desvincula Google e revoga sessões; recusa não-admin, inativa ou sem vínculo', async () => {
  const adminId = await criarStaff('remove-check-admin', null, 'admin');
  const caixaId = await criarStaff('remove-check-caixa');
  const alvoNaoAutorizado = await criarStaff('remove-nao-autorizado', `nao-autorizado-${run}@example.com`);
  await assert.rejects(
    () => removerEmailGoogleStaff(alvoNaoAutorizado, { id: caixaId }, `req-nao-admin-${run}`),
    (error) => error.status === 403
  );

  const vinculado = await criarStaff('remove-vinculado', `vinculado-${run}@example.com`);
  await pool.query('UPDATE staff SET google_sub = $2 WHERE id = $1', [vinculado, `linked-${run}`]);
  const tokenVinculado = `token-vinculado-${run}`;
  await pool.query("INSERT INTO staff_sessoes (token, staff_id, token_hash, expira_em) VALUES ($1, $2, $3, now() + interval '1 hour')", [tokenVinculado, vinculado, crypto.createHash('sha256').update(tokenVinculado).digest('hex')]);
  const desvinculado = await removerEmailGoogleStaff(vinculado, { id: adminId }, `req-vinculado-${run}`);
  assert.equal(desvinculado.email, null);
  assert.equal(desvinculado.googleVinculado, false);
  assert.equal(desvinculado.googleDesvinculado, true);
  assert.equal(desvinculado.sessoesRevogadas, 1);
  const identidade = await pool.query('SELECT email, google_sub FROM staff WHERE id = $1', [vinculado]);
  assert.equal(identidade.rows[0].email, null);
  assert.equal(identidade.rows[0].google_sub, null);
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE token = $1', [tokenVinculado])).rowCount, 0);

  const inativo = await criarStaff('remove-inativo', `inativo-${run}@example.com`);
  await pool.query('UPDATE staff SET ativo = FALSE WHERE id = $1', [inativo]);
  await assert.rejects(
    () => removerEmailGoogleStaff(inativo, { id: adminId }, `req-inativo-${run}`),
    (error) => error.status === 409
  );

  const semEmail = await criarStaff('remove-sem-email');
  await assert.rejects(
    () => removerEmailGoogleStaff(semEmail, { id: adminId }, `req-vazio-${run}`),
    (error) => error.status === 409
  );
});

test('PostgreSQL real: remoções concorrentes do mesmo e-mail não geram segunda auditoria', async () => {
  const adminId = await criarStaff('remove-conc-admin', null, 'admin');
  const alvoId = await criarStaff('remove-conc-alvo', `conc-remove-${run}@example.com`);
  const requestA = `req-remove-a-${run}`;
  const requestB = `req-remove-b-${run}`;

  const resultados = await Promise.allSettled([
    removerEmailGoogleStaff(alvoId, { id: adminId }, requestA),
    removerEmailGoogleStaff(alvoId, { id: adminId }, requestB),
  ]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.filter((r) => r.status === 'rejected' && r.reason?.status === 409).length, 1);

  const eventos = await pool.query(
    `SELECT id FROM auditoria_eventos
      WHERE acao = 'email_google_removido' AND alvo_id = $1
        AND request_id IN ($2, $3)`,
    [String(alvoId), requestA, requestB]
  );
  assert.equal(eventos.rowCount, 1);
});

test('PostgreSQL real: trocar e-mail de conta vinculada desfaz identidade anterior e revoga sessões', async () => {
  const adminId = await criarStaff('update-admin', null, 'admin');
  const alvoId = await criarStaff('update-linked', `antes-${run}@example.com`);
  await pool.query('UPDATE staff SET google_sub = $2 WHERE id = $1', [alvoId, `sub-update-${run}`]);
  const token = `token-update-${run}`;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.query("INSERT INTO staff_sessoes (token, staff_id, token_hash, expira_em) VALUES ($1, $2, $3, now() + interval '1 hour')", [token, alvoId, hash]);
  const atualizado = await definirEmailGoogleStaff(alvoId, `depois-${run}@example.com`, { id: adminId }, `req-update-${run}`);
  assert.equal(atualizado.email, `depois-${run}@example.com`);
  assert.equal(atualizado.googleVinculado, false);
  assert.equal(atualizado.googleDesvinculado, true);
  assert.equal(atualizado.sessoesRevogadas, 1);
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE token = $1', [token])).rowCount, 0);
});
