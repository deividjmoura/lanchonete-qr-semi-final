'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do PostgreSQL descartável');
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname), 'PostgreSQL local/CI obrigatório');
assert.strictEqual(databaseUrl.pathname, '/qradmin_test', 'Banco de teste obrigatório');
assert.strictEqual(process.env.NODE_ENV, 'test', 'NODE_ENV=test obrigatório');

const pool = require('../db/pool');
const { emitirTicketSse, consumirTicketSse, hashCredencialSse } = require('../db/sse-tickets');
const tickets = [];

test.after(async () => {
  if (tickets.length) {
    const hashes = tickets.map(hashCredencialSse);
    await pool.query('DELETE FROM sse_tickets WHERE ticket_hash = ANY($1::text[])', [hashes]);
  }
  await pool.end();
});

test('ticket SSE é armazenado apenas por hash, expira e só pode ser consumido uma vez', async () => {
  const credential = crypto.randomBytes(32).toString('hex');
  const ticket = await emitirTicketSse({ tipo: 'mesa', recursoId: 1, credencial: credential });
  tickets.push(ticket);

  const stored = (await pool.query(
    'SELECT ticket_hash,access_type,resource_id,credential_hash,expires_at,used_at FROM sse_tickets WHERE ticket_hash=$1',
    [hashCredencialSse(ticket)]
  )).rows[0];
  assert.ok(stored);
  assert.notEqual(stored.ticket_hash, ticket);
  assert.equal(stored.access_type, 'mesa');
  assert.equal(Number(stored.resource_id), 1);
  assert.equal(stored.credential_hash, hashCredencialSse(credential));
  assert.equal(stored.used_at, null);
  assert.ok(new Date(stored.expires_at).getTime() > Date.now());

  const grant = await consumirTicketSse(ticket);
  assert.equal(grant.access_type, 'mesa');
  assert.equal(Number(grant.resource_id), 1);
  assert.equal(grant.credential_hash, hashCredencialSse(credential));
  assert.equal(await consumirTicketSse(ticket), null, 'replay deve ser recusado');
});

test('ticket expirado, malformado ou desconhecido é recusado', async () => {
  const credential = 'credential-test';
  const expired = await emitirTicketSse({ tipo: 'garcom', recursoId: 7, credencial: credential, ttlMs: 1000 });
  tickets.push(expired);
  await pool.query('UPDATE sse_tickets SET expires_at=now()-interval \'1 second\' WHERE ticket_hash=$1', [hashCredencialSse(expired)]);
  assert.equal(await consumirTicketSse(expired), null);
  assert.equal(await consumirTicketSse('not-a-ticket'), null);
  assert.equal(await consumirTicketSse(crypto.randomBytes(32).toString('base64url')), null);
});
