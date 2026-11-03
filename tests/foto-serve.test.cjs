'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://foto:foto@127.0.0.1:5432/foto_test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../db/pool');
const {
  resolverFotoUrl,
  parseDataUrl,
  carregarFotoProduto,
} = require('../db/foto-serve');

test('data-URL vira endpoint same-origin sem carregar Base64 no cardápio', () => {
  assert.equal(resolverFotoUrl('data:image/webp;base64,YWJj', 42), '/api/cardapio/fotos/42');
  assert.equal(resolverFotoUrl(' data:image/png;base64,YWJj ', 7), '/api/cardapio/fotos/7');
  assert.equal(resolverFotoUrl('data:image/webp;base64,YWJj', 0), null);
  assert.equal(resolverFotoUrl('data:image/webp;base64,YWJj', '42'), null);
});

test('URLs externas e paths legados permanecem inalterados', () => {
  assert.equal(resolverFotoUrl('https://cdn.example/foto.webp', 1), 'https://cdn.example/foto.webp');
  assert.equal(resolverFotoUrl('/uploads/antiga.webp', 1), '/uploads/antiga.webp');
  assert.equal(resolverFotoUrl(null, 1), null);
  assert.equal(resolverFotoUrl('   ', 1), null);
});

test('parser aceita apenas imagens raster e Base64 válido', () => {
  const parsed = parseDataUrl('data:image/WEBP;base64,YWJj');
  assert.equal(parsed.contentType, 'image/webp');
  assert.equal(parsed.buffer.toString(), 'abc');
  for (const invalid of [
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:text/html;base64,PGgxPg==',
    'data:image/webp;base64,@@@',
    'data:image/webp;base64,',
    'not-a-data-url',
  ]) {
    assert.equal(parseDataUrl(invalid), null, invalid);
  }
});

test('parser rejeita payload maior que o limite de serviço', () => {
  const oversized = Buffer.alloc(6 * 1024 * 1024 + 1).toString('base64');
  assert.equal(parseDataUrl('data:image/webp;base64,' + oversized), null);
});

test('carregarFotoProduto valida ID e serve apenas a representação da foto', async () => {
  const originalQuery = pool.query;
  const calls = [];
  let stored = 'data:image/png;base64,YWJj';
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ foto_url: stored }] };
  };
  try {
    assert.equal(await carregarFotoProduto('0'), null);
    assert.equal(await carregarFotoProduto('abc'), null);
    assert.deepEqual(await carregarFotoProduto(12), {
      kind: 'data',
      contentType: 'image/png',
      buffer: Buffer.from('abc'),
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, [12]);

    stored = 'https://cdn.example/foto.jpg';
    assert.deepEqual(await carregarFotoProduto(13), {
      kind: 'redirect',
      location: 'https://cdn.example/foto.jpg',
    });

    stored = '/uploads/foto-antiga.webp';
    assert.deepEqual(await carregarFotoProduto(14), {
      kind: 'redirect',
      location: '/uploads/foto-antiga.webp',
    });

    stored = 'data:image/svg+xml;base64,PHN2Zz4=';
    assert.equal(await carregarFotoProduto(15), null);

    stored = null;
    assert.equal(await carregarFotoProduto(16), null);
  } finally {
    pool.query = originalQuery;
  }
});
