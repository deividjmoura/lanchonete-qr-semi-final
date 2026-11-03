'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do banco descartável');
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname), 'PostgreSQL local/CI obrigatório');
assert.strictEqual(databaseUrl.pathname, '/qradmin_test', 'Banco de teste obrigatório');
assert.strictEqual(process.env.NODE_ENV, 'test', 'NODE_ENV=test obrigatório');

const pool = require('../db/pool');
const auth = require('../db/auth');
const run = crypto.randomUUID().slice(0, 8);
const staffIds = [];

function reqWithCookie(token) {
  return {
    method: 'GET',
    headers: { cookie: `lqr_session=${encodeURIComponent(token)}` },
    socket: { encrypted: false },
  };
}

test.after(async () => {
  if (staffIds.length) {
    await pool.query('DELETE FROM staff_sessoes WHERE staff_id = ANY($1::int[])', [staffIds]);
    await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [staffIds]);
  }
  await pool.end();
});

test('sessões staff gravam SHA-256 e autenticam sem alterar o cookie bearer', async () => {
  const staff = (await pool.query(
    `INSERT INTO staff(nome,login,senha_hash,papel,ativo)
     VALUES($1,$2,$3,'caixa',TRUE) RETURNING id`,
    [`Hash fixture ${run}`, `hash-${run}`, 'x'.repeat(64)]
  )).rows[0];
  staffIds.push(staff.id);

  const token = await auth.criarSessao(staff.id);
  assert.match(token, /^[0-9a-f]{64}$/i);
  const expected = crypto.createHash('sha256').update(token).digest('hex');
  const stored = (await pool.query(
    'SELECT token, token_hash FROM staff_sessoes WHERE staff_id=$1 AND token=$2',
    [staff.id, token]
  )).rows[0];

  assert.ok(stored, 'mantém o registro legado durante a janela de rollback');
  assert.equal(stored.token_hash, expected, 'o digest SHA-256 deve ser persistido');
  assert.notEqual(stored.token_hash, token, 'o digest não pode ser igual ao bearer');
  const authenticated = await auth.getStaffDaRequisicao(reqWithCookie(token));
  assert.equal(authenticated.id, staff.id);
});

test('sessão legada sem digest continua válida e recebe backfill não destrutivo', async () => {
  const staff = (await pool.query(
    `INSERT INTO staff(nome,login,senha_hash,papel,ativo)
     VALUES($1,$2,$3,'caixa',TRUE) RETURNING id`,
    [`Legacy fixture ${run}`, `legacy-${run}`, 'y'.repeat(64)]
  )).rows[0];
  staffIds.push(staff.id);

  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO staff_sessoes(token,staff_id,expira_em) VALUES($1,$2,now()+interval \'1 hour\')',
    [token, staff.id]
  );
  const authenticated = await auth.getStaffDaRequisicao(reqWithCookie(token));
  assert.equal(authenticated.id, staff.id);
  const stored = (await pool.query(
    'SELECT token,token_hash FROM staff_sessoes WHERE token=$1',
    [token]
  )).rows[0];
  assert.equal(stored.token, token, 'não invalida nem remove o bearer legado durante a transição');
  assert.equal(stored.token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  await auth.destruirSessao(token);
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE staff_id=$1', [staff.id])).rowCount, 0);
});
