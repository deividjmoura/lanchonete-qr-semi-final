// Integração HTTP real dos tickets SSE de uso único (PR #222).
//
// Cobre o caminho que o teste de unidade de `db/sse-tickets.js` não alcança —
// a rota em si — porque foi justamente aí que um `ReferenceError` deixou
// `POST /api/events/ticket` respondendo 500 para todo mundo:
//
//   POST /api/events/ticket                → 201 { ticket, expiresInMs }
//   POST /api/events/ticket (origem hostil) → 403, sem emitir ticket
//   POST /api/events/ticket (sem credencial)→ 401
//   GET  /api/events?ticket=...             → 200 e o ticket é queimado
//   GET  /api/events?ticket=... (replay)    → 401
//   GET  /api/events?ticket=... (token revogado depois da emissão) → 401,
//                                             e o ticket continua inutilizável
//   GET  /api/events?mesa=... (legado)      → 200 enquanto o fallback existir
//
// Sobe o `server.js` de produção numa cópia isolada (harness
// `tests/helpers/public-table-server.cjs`) contra o PostgreSQL descartável.
//
//   DATABASE_URL=postgres://.../qradmin_test NODE_ENV=test \
//     node --test tests/postgres-sse-ticket-http.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { subirServidor, exigirAmbienteDeTeste } = require('./helpers/public-table-server.cjs');

exigirAmbienteDeTeste();
const pool = require('../db/pool');
const { hashCredencialSse } = require('../db/sse-tickets');

const SUFIXO = randomUUID().slice(0, 8);
let proximoNumeroMesa = 250000 + Math.floor(Math.random() * 50000);

const estado = { mesas: [], garcons: [] };
let servidor;

const chamar = (metodo, caminho, opcoes) => servidor.request(metodo, caminho, opcoes);

/** Origem aceita pelo servidor: o próprio host do processo de teste. */
function origemLocal() {
  return `http://127.0.0.1:${new URL(servidor.base).port}`;
}

async function criarMesa() {
  const token = randomUUID();
  const { rows } = await pool.query(
    "INSERT INTO mesas (numero, token, status) VALUES ($1, $2, 'livre') RETURNING id, numero",
    [proximoNumeroMesa++, token]
  );
  estado.mesas.push(rows[0].id);
  return { id: rows[0].id, token };
}

async function criarGarcom() {
  const token = randomUUID();
  const { rows } = await pool.query(
    'INSERT INTO garcons (nome, token, ativo) VALUES ($1, $2, TRUE) RETURNING id',
    [`Garçom SSE ${SUFIXO}`, token]
  );
  estado.garcons.push(rows[0].id);
  return { id: rows[0].id, token };
}

test.before(async () => {
  servidor = await subirServidor();
});

test.after(async () => {
  if (servidor) await servidor.encerrar();
  if (estado.garcons.length) await pool.query('DELETE FROM garcons WHERE id = ANY($1::int[])', [estado.garcons]);
  if (estado.mesas.length) await pool.query('DELETE FROM mesas WHERE id = ANY($1::int[])', [estado.mesas]);
  await pool.end();
});

test('POST /api/events/ticket emite ticket para mesa válida, sem devolver a credencial', async () => {
  const mesa = await criarMesa();
  const r = await chamar('POST', '/api/events/ticket', {
    corpo: { mesa: mesa.token },
    headers: { origin: origemLocal() },
  });

  assert.equal(r.status, 201, `esperado 201, veio ${r.status}: ${r.texto}`);
  assert.equal(typeof r.json.ticket, 'string');
  assert.match(r.json.ticket, /^[A-Za-z0-9_-]{40,50}$/);
  assert.equal(r.json.expiresInMs, 60000);
  assert.equal(r.json.ticket.includes(mesa.token), false, 'resposta não pode conter a credencial permanente');
  assert.equal(JSON.stringify(r.json).includes(mesa.token), false);
  assert.equal(r.headers['cache-control'], 'no-store');

  // O banco guarda só o digest do ticket e o digest da credencial.
  const linha = (await pool.query(
    'SELECT ticket_hash, access_type, resource_id, credential_hash, used_at FROM sse_tickets WHERE ticket_hash = $1',
    [hashCredencialSse(r.json.ticket)]
  )).rows[0];
  assert.ok(linha, 'ticket deve existir pelo hash');
  assert.notEqual(linha.ticket_hash, r.json.ticket);
  assert.equal(linha.access_type, 'mesa');
  assert.equal(Number(linha.resource_id), mesa.id);
  assert.equal(linha.credential_hash, hashCredencialSse(mesa.token));
  assert.equal(linha.used_at, null);
});

test('POST /api/events/ticket recusa origem hostil sem emitir ticket', async () => {
  const mesa = await criarMesa();
  const antes = Number((await pool.query('SELECT count(*) AS n FROM sse_tickets')).rows[0].n);

  const r = await chamar('POST', '/api/events/ticket', {
    corpo: { mesa: mesa.token },
    headers: { origin: 'https://atacante.example' },
  });
  assert.equal(r.status, 403, `origem cross-site deve ser recusada: ${r.texto}`);
  assert.equal(JSON.stringify(r.json).includes('ticket'), false);

  const depois = Number((await pool.query('SELECT count(*) AS n FROM sse_tickets')).rows[0].n);
  assert.equal(depois, antes, 'origem recusada não pode criar ticket');
});

test('POST /api/events/ticket recusa credencial ausente, inválida e inativa', async () => {
  const semCredencial = await chamar('POST', '/api/events/ticket', {
    corpo: {},
    headers: { origin: origemLocal() },
  });
  assert.equal(semCredencial.status, 401);

  const tokenInvalido = await chamar('POST', '/api/events/ticket', {
    corpo: { mesa: randomUUID() },
    headers: { origin: origemLocal() },
  });
  assert.equal(tokenInvalido.status, 401);
  assert.equal(JSON.stringify(tokenInvalido.json).includes('ticket'), false);

  const garcom = await criarGarcom();
  await pool.query('UPDATE garcons SET ativo = FALSE WHERE id = $1', [garcom.id]);
  const inativo = await chamar('POST', '/api/events/ticket', {
    corpo: { garcom: garcom.token },
    headers: { origin: origemLocal() },
  });
  assert.equal(inativo.status, 401);

  const doisTipos = await chamar('POST', '/api/events/ticket', {
    corpo: { mesa: randomUUID(), garcom: randomUUID() },
    headers: { origin: origemLocal() },
  });
  assert.equal(doisTipos.status, 400);
});

test('GET /api/events?ticket consome o ticket uma única vez', async () => {
  const mesa = await criarMesa();
  const emissao = await chamar('POST', '/api/events/ticket', {
    corpo: { mesa: mesa.token },
    headers: { origin: origemLocal() },
  });
  assert.equal(emissao.status, 201, emissao.texto);
  const { ticket } = emissao.json;

  const primeiro = await chamar('GET', `/api/events?ticket=${encodeURIComponent(ticket)}`, { streamMs: 800 });
  assert.equal(primeiro.status, 200, `primeiro uso deveria abrir o stream: ${primeiro.texto}`);
  assert.match(primeiro.headers['content-type'] || '', /text\/event-stream/);
  assert.match(primeiro.texto, /event: hello/);

  const replay = await chamar('GET', `/api/events?ticket=${encodeURIComponent(ticket)}`);
  assert.equal(replay.status, 401, 'replay do mesmo ticket deve ser recusado');

  const linha = (await pool.query(
    'SELECT used_at FROM sse_tickets WHERE ticket_hash = $1',
    [hashCredencialSse(ticket)]
  )).rows[0];
  assert.ok(linha.used_at, 'ticket consumido deve ficar marcado como usado');
});

test('ticket continua inutilizável quando a credencial é revogada depois da emissão', async () => {
  const garcom = await criarGarcom();
  const emissao = await chamar('POST', '/api/events/ticket', {
    corpo: { garcom: garcom.token },
    headers: { origin: origemLocal() },
  });
  assert.equal(emissao.status, 201, emissao.texto);

  // Revogação entre a emissão e o consumo: o token do garçom muda.
  await pool.query('UPDATE garcons SET token = $2 WHERE id = $1', [garcom.id, randomUUID()]);

  const uso = await chamar('GET', `/api/events?ticket=${encodeURIComponent(emissao.json.ticket)}`, { streamMs: 800 });
  assert.equal(uso.status, 401, 'credencial revogada não pode autorizar o stream');

  // E o ticket não pode ser reciclado para uma tentativa posterior.
  const tentativa = await chamar('GET', `/api/events?ticket=${encodeURIComponent(emissao.json.ticket)}`);
  assert.equal(tentativa.status, 401);
});

test('fallback legado ?mesa= segue funcionando enquanto a janela de compatibilidade existir', async () => {
  const mesa = await criarMesa();
  const r = await chamar('GET', `/api/events?mesa=${encodeURIComponent(mesa.token)}`, { streamMs: 800 });
  assert.equal(r.status, 200, `fallback legado deveria abrir o stream: ${r.texto}`);
  assert.match(r.headers['content-type'] || '', /text\/event-stream/);
});
