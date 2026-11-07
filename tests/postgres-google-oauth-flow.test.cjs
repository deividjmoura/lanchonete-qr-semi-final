'use strict';

// Exercita o callback completo com PostgreSQL real e respostas Google simuladas.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

assert.equal(new URL(process.env.DATABASE_URL || 'postgres://x/none').pathname, '/qradmin_test',
  'Integração bloqueada: database deve ser qradmin_test');

const ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_OAUTH_STATE_SECRET', 'NODE_ENV', 'STAFF_FORCE_PASSWORD_CHANGE'];
const previousEnv = Object.fromEntries(ENV.map((key) => [key, process.env[key]]));
Object.assign(process.env, {
  GOOGLE_CLIENT_ID: 'client-id-ficticio',
  GOOGLE_CLIENT_SECRET: 'client-secret-ficticio',
  GOOGLE_REDIRECT_URI: 'https://qradmin.up.railway.app/api/auth/google/callback',
  GOOGLE_OAUTH_STATE_SECRET: 'segredo-de-teste-oauth-google-com-mais-de-32-bytes',
  NODE_ENV: 'test',
  STAFF_FORCE_PASSWORD_CHANGE: 'true',
});

const pool = require('../db/pool');
const auth = require('../db/auth');
const oauth = require('../db/oauth-google');
const run = `oauthflow${process.pid}${crypto.randomBytes(4).toString('hex')}`;
const ids = [];

async function criarStaff(sufixo, email, papel = 'caixa') {
  const login = `${run}-${sufixo}`;
  const { rows } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, email, deve_trocar_senha)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
    [`OAuth ${sufixo}`, login, `hash-ficticio-${login}`, papel, email]
  );
  ids.push(rows[0].id);
  return rows[0].id;
}

function prepararInicio() {
  const inicio = oauth.iniciarOAuth();
  const valor = inicio.cookie.split(';', 1)[0].slice('qr_google_oauth='.length);
  const state = new URL(inicio.url).searchParams.get('state');
  return { req: { headers: { cookie: `qr_google_oauth=${valor}` } }, state };
}

function respostaGoogle(profile) {
  let chamada = 0;
  return async (url, options) => {
    chamada += 1;
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      assert.equal(options.method, 'POST');
      assert.match(String(options.body), /code_verifier=/);
      return { ok: true, json: async () => ({ access_token: 'access-token-ficticio', token_type: 'Bearer' }) };
    }
    assert.equal(String(url), 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.equal(options.headers.Authorization, 'Bearer access-token-ficticio');
    return { ok: true, json: async () => profile };
  };
}

test.after(async () => {
  await pool.query('DELETE FROM staff_sessoes WHERE staff_id = ANY($1::int[])', [ids]);
  if (ids.length) await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [ids]);
  await pool.end();
  for (const key of ENV) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});

test('PostgreSQL real: callback Google valida identidade, vincula sub e cria sessão lqr_session', async () => {
  const email = `${run}@example.com`;
  const staffId = await criarStaff('caixa', email, 'caixa');
  const inicio = prepararInicio();
  const anterior = global.fetch;
  global.fetch = respostaGoogle({ sub: `google-sub-${run}`, email: email.toUpperCase(), email_verified: true });
  let resultado;
  try {
    resultado = await oauth.concluirOAuth(inicio.req, 'codigo-ficticio', inicio.state);
  } finally {
    global.fetch = anterior;
  }

  assert.equal(resultado.staff.id, staffId);
  assert.equal(resultado.staff.papel, 'caixa');
  assert.equal(resultado.staff.deveTrocarSenha, true);
  assert.equal(resultado.home, '/caixa');
  assert.match(resultado.token, /^[a-f0-9]{64}$/);

  const vinculo = await pool.query('SELECT google_sub FROM staff WHERE id = $1', [staffId]);
  assert.equal(vinculo.rows[0].google_sub, `google-sub-${run}`);
  const sessao = await pool.query('SELECT staff_id FROM staff_sessoes WHERE token = $1', [resultado.token]);
  assert.equal(sessao.rowCount, 1);
  assert.equal(sessao.rows[0].staff_id, staffId);
  const autenticado = await auth.getStaffDaRequisicao({ headers: { cookie: `lqr_session=${resultado.token}` } });
  assert.equal(autenticado.id, staffId);
  assert.equal(autenticado.papel, 'caixa');
  await auth.destruirSessao(resultado.token);
});

test('PostgreSQL real: e-mail Google não verificado não vincula conta nem cria sessão', async () => {
  const email = `${run}-nao-verificado@example.com`;
  const staffId = await criarStaff('nao-verificado', email);
  const inicio = prepararInicio();
  const anterior = global.fetch;
  global.fetch = respostaGoogle({ sub: `unverified-${run}`, email, email_verified: false });
  try {
    await assert.rejects(
      oauth.concluirOAuth(inicio.req, 'codigo-ficticio', inicio.state),
      (error) => error.status === 403
    );
  } finally {
    global.fetch = anterior;
  }
  const row = await pool.query('SELECT google_sub FROM staff WHERE id = $1', [staffId]);
  assert.equal(row.rows[0].google_sub, null);
  const sessions = await pool.query('SELECT 1 FROM staff_sessoes WHERE staff_id = $1', [staffId]);
  assert.equal(sessions.rowCount, 0);
});
