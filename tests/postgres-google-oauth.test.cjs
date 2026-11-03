'use strict';

// Integração real da migration 0034 e das garantias de unicidade do vínculo Google.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

assert.equal(new URL(process.env.DATABASE_URL || 'postgres://x/none').pathname, '/qradmin_test',
  'Integração bloqueada: database deve ser qradmin_test');

const pool = require('../db/pool');
const run = `oauth${process.pid}${crypto.randomBytes(4).toString('hex')}`;
const ids = [];

async function criarStaff(sufixo, email = null) {
  const login = `${run}-${sufixo}`;
  const { rows } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, email)
     VALUES ($1, $2, $3, 'caixa', $4) RETURNING id`,
    [`OAuth ${sufixo}`, login, `hash-ficticio-${login}`, email]
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
