'use strict';

const zlib = require('node:zlib');

const MIN_COMPRESS_BYTES = 1024;
const COMPRESSIBLE_TYPE = /^(?:text\/|application\/(?:json|javascript|xml|manifest\+json)|image\/svg\+xml)/i;

function acceptsEncoding(header, encoding) {
  const entries = String(header || '').split(',').map((entry) => {
    const [name, ...params] = entry.trim().toLowerCase().split(';');
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    return { name, q: Number.isFinite(q) ? q : 0 };
  });
  const exact = entries.find((entry) => entry.name === encoding);
  if (exact) return exact.q > 0;
  const wildcard = entries.find((entry) => entry.name === '*');
  return Boolean(wildcard && wildcard.q > 0);
}

function appendVary(headers, value) {
  const existing = String(headers.Vary || headers.vary || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (!existing.some((v) => v.toLowerCase() === value.toLowerCase())) existing.push(value);
  delete headers.vary;
  headers.Vary = existing.join(', ');
}

function compressResponse({ requestHeaders = {}, status = 200, contentType = '', body, headers = {} }) {
  const responseHeaders = { ...headers };
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body == null ? '' : String(body));
  const type = String(contentType || responseHeaders['Content-Type'] || '');
  const eligible = status !== 204 && status !== 304 &&
    COMPRESSIBLE_TYPE.test(type) &&
    payload.length >= MIN_COMPRESS_BYTES &&
    !responseHeaders['Content-Encoding'] &&
    !/no-transform/i.test(String(responseHeaders['Cache-Control'] || ''));

  if (!eligible) return { body: payload, headers: responseHeaders, encoding: null };

  appendVary(responseHeaders, 'Accept-Encoding');
  if (acceptsEncoding(requestHeaders['accept-encoding'], 'br')) {
    return { body: zlib.brotliCompressSync(payload), headers: { ...responseHeaders, 'Content-Encoding': 'br' }, encoding: 'br' };
  }
  if (acceptsEncoding(requestHeaders['accept-encoding'], 'gzip')) {
    return { body: zlib.gzipSync(payload), headers: { ...responseHeaders, 'Content-Encoding': 'gzip' }, encoding: 'gzip' };
  }
  return { body: payload, headers: responseHeaders, encoding: null };
}

function cacheControlForStaticAsset(urlPath) {
  const pathname = String(urlPath || '').split('?')[0];
  const basename = pathname.slice(pathname.lastIndexOf('/') + 1);
  const hasExtension = /\.[a-z0-9]{1,8}$/i.test(basename);
  const hasContentHash = /[-.]([a-z0-9_-]{8,})\.[a-z0-9]{1,8}$/i.test(basename);
  if (pathname.startsWith('/assets/') && hasExtension && hasContentHash) {
    return 'public, max-age=31536000, immutable';
  }
  return 'no-store';
}

module.exports = { compressResponse, cacheControlForStaticAsset, MIN_COMPRESS_BYTES };
