'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Este teste não consulta banco; o pool compartilhado só exige uma URL válida.
process.env.DATABASE_URL ||= 'postgres://regress:regress@127.0.0.1:5432/regress';
const oauth = require('../db/oauth-google');
const auth = require('../db/auth');

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
    GOOGLE_REDIRECT_URI: 'https://qradmin.up.railway.app/api/auth/google/callback',
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


test('callback recusa cookie ausente, assinatura adulterada e payload malformado sem contactar Google', () => comOAuthConfigurado(async () => {
  const anterior = global.fetch;
  let chamadas = 0;
  global.fetch = async () => { chamadas += 1; throw new Error('não deveria contactar Google'); };
  const valido = cookieAssinado({ state: 'state-valido', verifier: 'verifier-valido', iat: Date.now() }, process.env.GOOGLE_OAUTH_STATE_SECRET);
  const [payload, assinatura] = valido.split('.');
  const casos = [
    { headers: {} },
    requestComCookie('sem-assinatura'),
    requestComCookie(`${payload}.${assinatura}.extra`),
    requestComCookie(`${payload}.${assinatura.slice(0, -1)}${assinatura.endsWith('a') ? 'b' : 'a'}`),
    requestComCookie(cookieAssinado({ state: 'state-valido', iat: Date.now() }, process.env.GOOGLE_OAUTH_STATE_SECRET)),
    requestComCookie(cookieAssinado({ state: 'state-valido', verifier: 'x', iat: Date.now() + 120000 }, process.env.GOOGLE_OAUTH_STATE_SECRET)),
  ];
  try {
    for (const req of casos) {
      await assert.rejects(oauth.concluirOAuth(req, 'codigo-ficticio', 'state-valido'), (e) => e.status === 400);
    }
    assert.equal(chamadas, 0);
  } finally { global.fetch = anterior; }
}));

test('cookie de sessão preserva atributos de segurança e é host-only nos dois ambientes', () => {
  const anterior = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'test';
    const local = auth.cookieDeSessao('token-sintetico');
    assert.match(local, /^lqr_session=token-sintetico;/);
    assert.match(local, /HttpOnly/);
    assert.match(local, /SameSite=Lax/);
    assert.match(local, /Path=\//);
    assert.match(local, /Max-Age=43200/);
    assert.doesNotMatch(local, /Domain=/i);
    assert.doesNotMatch(local, /Secure/);
    process.env.NODE_ENV = 'production';
    const producao = auth.cookieDeSessao('token-sintetico');
    assert.match(producao, /Secure/);
    assert.match(producao, /HttpOnly/);
    assert.match(producao, /SameSite=Lax/);
    assert.match(producao, /Path=\//);
    assert.doesNotMatch(producao, /Domain=/i);
    assert.match(auth.cookieDeLogout(), /Max-Age=0/);
    assert.match(auth.cookieDeLogout(), /Secure/);
    assert.match(oauth.limparCookieEstado(), /Secure/);
  } finally {
    if (anterior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = anterior;
  }
});

test('configuração recusa callback com path/query/hash errado e HTTPS obrigatório em produção', () => comOAuthConfigurado(() => {
  const original = process.env.GOOGLE_REDIRECT_URI;
  const nodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    for (const uri of [
      'http://qradmin.up.railway.app/api/auth/google/callback',
      'https://qradmin.up.railway.app/callback',
      'https://qradmin.up.railway.app/api/auth/google/callback?x=1',
      'https://qradmin.up.railway.app/api/auth/google/callback#fragmento',
      'não é uma URL',
    ]) {
      process.env.GOOGLE_REDIRECT_URI = uri;
      assert.deepEqual(oauth.statusOAuth(), { enabled: false });
    }
    process.env.GOOGLE_REDIRECT_URI = original;
    assert.deepEqual(oauth.statusOAuth(), { enabled: true });
  } finally {
    process.env.GOOGLE_REDIRECT_URI = original;
    process.env.NODE_ENV = nodeEnv;
  }
}));
