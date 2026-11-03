'use strict';

// OAuth 2.0 Google para contas de staff já existentes. Não cria contas.
// O vínculo é feito exclusivamente por e-mail verificado e único no cadastro.
const crypto = require('crypto');
const pool = require('./pool');
const { criarSessao, homeDoPapel } = require('./auth');

const STATE_COOKIE = 'qr_google_oauth';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

function configuracao(env = process.env) {
  const clientId = String(env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = String(env.GOOGLE_REDIRECT_URI || '').trim();
  const stateSecret = String(env.GOOGLE_OAUTH_STATE_SECRET || clientSecret).trim();
  if (!clientId || !clientSecret || !redirectUri || !stateSecret) return null;
  let parsed;
  try { parsed = new URL(redirectUri); } catch { return null; }
  if (parsed.protocol !== 'https:' && env.NODE_ENV === 'production') return null;
  if (parsed.pathname !== '/api/auth/google/callback' || parsed.search || parsed.hash) return null;
  return { clientId, clientSecret, redirectUri, stateSecret };
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function assinar(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function comparar(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function cookieEstado(valor, maxAge = 600) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${STATE_COOKIE}=${valor}; HttpOnly; Path=/api/auth/google; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function limparCookieEstado() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${STATE_COOKIE}=; HttpOnly; Path=/api/auth/google; SameSite=Lax; Max-Age=0${secure}`;
}

function gerarDesafio(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function iniciarOAuth() {
  const cfg = configuracao();
  if (!cfg) {
    const error = new Error('Login Google não configurado.');
    error.status = 503;
    throw error;
  }
  const state = base64url(crypto.randomBytes(32));
  const verifier = base64url(crypto.randomBytes(48));
  const payload = base64url(JSON.stringify({ state, verifier, iat: Date.now() }));
  const signed = `${payload}.${assinar(payload, cfg.stateSecret)}`;
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    code_challenge: gerarDesafio(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { url: url.toString(), cookie: cookieEstado(signed) };
}

function lerEstado(req, cfg) {
  const raw = require('./auth').parseCookies(req)[STATE_COOKIE];
  if (!raw || raw.length > 2048) return null;
  const [payload, signature, extra] = raw.split('.');
  if (!payload || !signature || extra || !comparar(assinar(payload, cfg.stateSecret), signature)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.state || !data.verifier || !Number.isFinite(data.iat)) return null;
    if (Date.now() - data.iat > 10 * 60 * 1000 || data.iat > Date.now() + 60 * 1000) return null;
    return data;
  } catch { return null; }
}

async function concluirOAuth(req, code, state) {
  const cfg = configuracao();
  if (!cfg) {
    const error = new Error('Login Google não configurado.');
    error.status = 503;
    throw error;
  }
  const saved = lerEstado(req, cfg);
  if (!saved || !comparar(saved.state, state)) {
    const error = new Error('A validação de segurança do login Google expirou. Tente novamente.');
    error.status = 400;
    throw error;
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: saved.verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenResponse.ok) {
    const error = new Error('O Google não autorizou esta tentativa de login.');
    error.status = 401;
    throw error;
  }
  const tokens = await tokenResponse.json();
  if (!tokens.access_token || tokens.token_type?.toLowerCase() !== 'bearer') {
    const error = new Error('Resposta inválida do provedor Google.');
    error.status = 401;
    throw error;
  }

  const profileResponse = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!profileResponse.ok) {
    const error = new Error('Não foi possível validar a conta Google.');
    error.status = 401;
    throw error;
  }
  const profile = await profileResponse.json();
  const email = String(profile.email || '').trim().toLowerCase();
  if (!profile.sub || !email || profile.email_verified !== true) {
    const error = new Error('Use uma conta Google com e-mail verificado.');
    error.status = 403;
    throw error;
  }

  const { rows } = await pool.query(
    `SELECT id, nome, login, papel, ativo
       FROM staff
      WHERE lower(email) = $1
      LIMIT 2`,
    [email]
  );
  if (rows.length !== 1 || !rows[0].ativo) {
    const error = new Error('Esta conta Google não está vinculada a um funcionário ativo do QRAdmin.');
    error.status = 403;
    throw error;
  }
  const staff = rows[0];
  const linked = await pool.query(
    'SELECT google_sub FROM staff WHERE id = $1',
    [staff.id]
  );
  if (linked.rows[0].google_sub && linked.rows[0].google_sub !== profile.sub) {
    const error = new Error('Esta conta de funcionário já está vinculada a outra conta Google.');
    error.status = 403;
    throw error;
  }
  await pool.query(
    'UPDATE staff SET google_sub = $2 WHERE id = $1 AND ativo = TRUE',
    [staff.id, profile.sub]
  );
  const token = await criarSessao(staff.id);
  return { staff: { id: staff.id, nome: staff.nome, login: staff.login, papel: staff.papel, deveTrocarSenha: false }, token, home: homeDoPapel(staff.papel) };
}

function statusOAuth() {
  return { enabled: Boolean(configuracao()) };
}

module.exports = { iniciarOAuth, concluirOAuth, statusOAuth, limparCookieEstado };
