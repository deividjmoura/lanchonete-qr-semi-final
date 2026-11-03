'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const oauth = require('../db/oauth-google');

const ENV_NAMES = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_OAUTH_STATE_SECRET',
  'NODE_ENV',
];

async function comOAuthConfigurado(fn) {
  const previous = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: 'client-id-ficticio',
    GOOGLE_CLIENT_SECRET: 'client-secret-ficticio',
    GOOGLE_REDIRECT_URI: 'https://qradminn.up.railway.app/api/auth/google/callback',
    GOOGLE_OAUTH_STATE_SECRET: 'state-secret-ficticio-com-mais-de-32-bytes',
    NODE_ENV: 'test',
  });
  try {
    return await fn();
  } finally {
    for (const name of ENV_NAMES) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

function cookieValue(setCookie) {
  return setCookie.split(';', 1)[0].slice('qr_google_oauth='.length);
}

function requestComCookie(value) {
  return { headers: { cookie: `qr_google_oauth=${value}` } };
}

function cookieAssinado(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

test('OAuth Google fica desabilitado sem credenciais completas', () => {
  const previous = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of ENV_NAMES) delete process.env[name];
    assert.deepEqual(oauth.statusOAuth(), { enabled: false });
    assert.throws(() => oauth.iniciarOAuth(), (error) => error.status === 503);
  } finally {
    for (const name of ENV_NAMES) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('início OAuth gera state, PKCE S256 e cookie HttpOnly com escopo restrito', () => comOAuthConfigurado(() => {
  const inicio = oauth.iniciarOAuth();
  const url = new URL(inicio.url);
  const cookie = inicio.cookie;
  const signed = cookieValue(cookie);
  const [payload] = signed.split('.');
  const stateData = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.pathname, '/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'client-id-ficticio');
  assert.equal(url.searchParams.get('redirect_uri'), process.env.GOOGLE_REDIRECT_URI);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'openid email');
  assert.equal(url.searchParams.get('state'), stateData.state);
  assert.equal(
    url.searchParams.get('code_challenge'),
    crypto.createHash('sha256').update(stateData.verifier).digest('base64url')
  );
  assert.ok(stateData.state.length >= 40);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\/api\/auth\/google/);
  assert.match(cookie, /Max-Age=600/);
  assert.ok(!cookie.includes('client-secret-ficticio'));
}));

test('callback recusa state adulterado antes de contactar o Google', async () => comOAuthConfigurado(async () => {
  const inicio = oauth.iniciarOAuth();
  const anterior = global.fetch;
  let chamadas = 0;
  global.fetch = async () => { chamadas += 1; throw new Error('fetch não deveria ser chamado'); };
  try {
    await assert.rejects(
      oauth.concluirOAuth(requestComCookie(cookieValue(inicio.cookie)), 'codigo-ficticio', 'state-adulterado'),
      (error) => error.status === 400
    );
    assert.equal(chamadas, 0);
  } finally {
    global.fetch = anterior;
  }
}));

test('callback recusa state expirado antes de contactar o Google', async () => comOAuthConfigurado(async () => {
  const cookie = cookieAssinado({
    state: 'state-expirado',
    verifier: 'verifier-ficticio',
    iat: Date.now() - 11 * 60 * 1000,
  }, process.env.GOOGLE_OAUTH_STATE_SECRET);
  const anterior = global.fetch;
  let chamadas = 0;
  global.fetch = async () => { chamadas += 1; throw new Error('fetch não deveria ser chamado'); };
  try {
    await assert.rejects(
      oauth.concluirOAuth(requestComCookie(cookie), 'codigo-ficticio', 'state-expirado'),
      (error) => error.status === 400
    );
    assert.equal(chamadas, 0);
  } finally {
    global.fetch = anterior;
  }
}));

test('cookie de estado OAuth é removido com escopo restrito', () => {
  const cookie = oauth.limparCookieEstado();
  assert.match(cookie, /^qr_google_oauth=;/);
  assert.match(cookie, /Path=\/api\/auth\/google/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=0/);
});
