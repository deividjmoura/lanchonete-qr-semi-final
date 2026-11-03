'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const oauth = require('../db/oauth-google');

test('OAuth Google fica desabilitado sem credenciais completas', () => {
  const names = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_OAUTH_STATE_SECRET'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.deepEqual(oauth.statusOAuth(), { enabled: false });
    assert.throws(() => oauth.iniciarOAuth(), (error) => error.status === 503);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('cookie de estado OAuth é removido com escopo restrito', () => {
  const cookie = oauth.limparCookieEstado();
  assert.match(cookie, /^qr_google_oauth=;/);
  assert.match(cookie, /Path=\/api\/auth\/google/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=0/);
});
