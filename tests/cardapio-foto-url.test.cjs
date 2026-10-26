'use strict';

// Issue #53: o cardápio não pode transportar bytes de imagem em Base64 no
// JSON. Testes herméticos da representação/medida; o roteamento no servidor
// é verificado estruturalmente.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:5432/qradmin_test';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolverFotoUrl, parseDataUrl, carregarFotoProduto } = require('../db/foto-serve');
const pool = require('../db/pool');

test('data-URL vira URL de mesma origem; URLs externas e legadas ficam intactas', () => {
  assert.equal(resolverFotoUrl('data:image/webp;base64,AAAA', 12), '/api/cardapio/fotos/12');
  assert.equal(resolverFotoUrl('https://cdn.externo.com/foto.webp', 12), 'https://cdn.externo.com/foto.webp');
  assert.equal(resolverFotoUrl('/uploads/antigo.webp', 12), '/uploads/antigo.webp');
  assert.equal(resolverFotoUrl('', 12), null);
  assert.equal(resolverFotoUrl(null, 12), null);
  assert.equal(resolverFotoUrl(undefined, 12), null);
  // data-URL sem id de produto válido não pode virar URL quebrada
  assert.equal(resolverFotoUrl('data:image/webp;base64,AAAA', 0), null);
  assert.equal(resolverFotoUrl('data:image/webp;base64,AAAA', 'x'), null);
});

test('parseDataUrl devolve tipo de conteúdo e bytes sem rede', () => {
  const png1px =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const parsed = parseDataUrl(png1px);
  assert.equal(parsed.contentType, 'image/png');
  assert.ok(parsed.buffer.length > 0);
  assert.equal(parseDataUrl('nao-e-data-url'), null);
});

test('payload de 40 produtos encolhe drasticamente ao trocar Base64 por URL', () => {
  // Fixture sintética no teto do otimizador: WebP de ~320 KiB por foto.
  const foto = `data:image/webp;base64,${'A'.repeat(320 * 1024)}`;
  const produtos = Array.from({ length: 40 }, (_, i) => ({
    id: i + 1,
    nome: `Produto ${i + 1}`,
    preco: 19.9,
    fotoUrl: foto,
  }));

  const formatoLegado = JSON.stringify(produtos);
  const formatoNovo = JSON.stringify(
    produtos.map((p) => ({ ...p, fotoUrl: resolverFotoUrl(p.fotoUrl, p.id) }))
  );

  // O formato legado carrega ~4/3 dos bytes por imagem; o novo só referencia.
  assert.ok(formatoLegado.length > 12 * 1024 * 1024, 'legado deveria passar de 12 MB para 40 fotos');
  assert.ok(formatoNovo.length < 8 * 1024, 'novo formato deveria ficar em alguns KB');
  const reducao = (1 - formatoNovo.length / formatoLegado.length) * 100;
  assert.ok(reducao > 99.9, `redução esperada acima de 99,9%; obtido ${reducao.toFixed(4)}%`);
  // nenhuma resposta nova contém cabeçalho data:
  assert.doesNotMatch(formatoNovo, /data:image\/webp;base64/);
});

test('carregarFotoProduto trata data-URL, URL externa, caminho legado e ausência', async () => {
  const png1px =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const casos = [
    { foto_url: png1px },
    { foto_url: 'https://cdn.externo.com/f.webp' },
    { foto_url: '/uploads/legado.webp' },
    { foto_url: null },
  ];
  const queryOriginal = pool.query;
  pool.query = async (sql, params) => ({ rows: [casos[(params[0] - 1) % casos.length]] });
  try {
    const data = await carregarFotoProduto(1);
    assert.equal(data.kind, 'data');
    assert.equal(data.contentType, 'image/png');
    assert.ok(data.buffer.length > 0);

    const externa = await carregarFotoProduto(2);
    assert.deepEqual(externa, { kind: 'redirect', location: 'https://cdn.externo.com/f.webp' });

    const legado = await carregarFotoProduto(3);
    assert.deepEqual(legado, { kind: 'redirect', location: '/uploads/legado.webp' });

    assert.equal(await carregarFotoProduto(4), null);
    assert.equal(await carregarFotoProduto(0), null);
    assert.equal(await carregarFotoProduto('abc'), null);
  } finally {
    pool.query = queryOriginal;
  }
});

test('cardápio público usa o resolvedor e o servidor expõe o endpoint read-only', () => {
  const cardapio = fs.readFileSync(path.join(__dirname, '..', 'db', 'cardapio.js'), 'utf8');
  assert.match(cardapio, /resolverFotoUrl\(p\.foto_url, p\.id\)/);

  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /cardapio\\\/fotos\\\/\(\\d\+\)\$/, 'rota de fotos precisa existir no servidor');
  assert.match(server, /carregarFotoProduto\(fotoMatch\[1\]\)/);
  // o endpoint apenas lê e responde 404/302/200: sem INSERT/UPDATE/DELETE
  const inicio = server.search(/cardapio\\\/fotos\\\/\(\\d\+\)\$/);
  assert.ok(inicio > 0);
  const bloco = server.slice(inicio, inicio + 900);
  assert.doesNotMatch(bloco, /INSERT|UPDATE|DELETE/);
});
