'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { compressResponse, cacheControlForStaticAsset } = require('../server/http-response');

const payload = Buffer.from('menu item '.repeat(500));

test('comprime respostas textuais grandes com Brotli quando o cliente aceita', () => {
  const result = compressResponse({
    requestHeaders: { 'accept-encoding': 'gzip, br' },
    contentType: 'application/json; charset=utf-8',
    body: payload,
    headers: { 'Cache-Control': 'no-store' },
  });
  assert.equal(result.encoding, 'br');
  assert.ok(result.body.length < payload.length, `Brotli: ${result.body.length} < ${payload.length} bytes`);
  assert.equal(result.headers['Content-Encoding'], 'br');
  assert.match(result.headers.Vary, /Accept-Encoding/i);
  assert.deepEqual(zlib.brotliDecompressSync(result.body), payload);
});

test('usa gzip quando Brotli não é aceito e preserva Vary existente', () => {
  const result = compressResponse({
    requestHeaders: { 'accept-encoding': 'gzip' },
    contentType: 'text/javascript; charset=utf-8',
    body: payload,
    headers: { Vary: 'Origin' },
  });
  assert.equal(result.encoding, 'gzip');
  assert.ok(result.body.length < payload.length, `gzip: ${result.body.length} < ${payload.length} bytes`);
  assert.match(result.headers.Vary, /Origin/i);
  assert.match(result.headers.Vary, /Accept-Encoding/i);
  assert.deepEqual(zlib.gunzipSync(result.body), payload);
});

test('não comprime payload pequeno, binário ou quando encoding tem q=0', () => {
  for (const options of [
    { requestHeaders: { 'accept-encoding': 'gzip' }, contentType: 'application/json', body: 'small' },
    { requestHeaders: { 'accept-encoding': 'gzip' }, contentType: 'image/png', body: payload },
    { requestHeaders: { 'accept-encoding': 'gzip;q=0, br;q=0' }, contentType: 'text/plain', body: payload },
  ]) {
    const result = compressResponse(options);
    assert.equal(result.encoding, null);
    assert.deepEqual(result.body, Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body));
  }
});

test('assets com hash recebem cache imutável; HTML e arquivos sem hash não', () => {
  assert.equal(cacheControlForStaticAsset('/assets/index-AbCdEf123.js'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControlForStaticAsset('/assets/react-12345678.js'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControlForStaticAsset('/index.html'), 'no-store');
  assert.equal(cacheControlForStaticAsset('/assets/app.js'), 'no-store');
  assert.equal(cacheControlForStaticAsset('/api/assets/index-AbCdEf123.js'), 'no-store');
});
