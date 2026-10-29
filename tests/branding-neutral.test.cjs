'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('legacy pages and generated distribution use QR Admin branding', () => {
  const files = [
    'index.html', 'public/index.html', 'public/mesa.html', 'public/pedido.html',
    'public/admin.html', 'public/caixa.html', 'public/garcom.html',
    'public/cozinha.html', 'public/bar.html', 'public/login.html',
    'dist/index.html', 'dist/mesa.html', 'dist/pedido.html',
    'dist/admin.html', 'dist/caixa.html', 'dist/garcom.html',
    'dist/cozinha.html', 'dist/bar.html', 'dist/login.html',
    'public/js/admin-relatorio.js', 'dist/js/admin-relatorio.js', 'db/seed.js',
    'src/lib/print.ts', 'package.json',
  ];
  for (const file of files) {
    const content = read(file);
    assert.match(content, /QR Admin/, file + ' must show QR Admin');
    assert.doesNotMatch(content, /Major Pub|major-pub|Delícias de São Miguel|Delicias de São Miguel|delicias de sao miguel|logo-cliente|branding\/delicias/i, file + ' must not reference previous customer branding');
  }
});

test('previous customer logo assets are no longer shipped and QR Admin logo remains', () => {
  for (const file of [
    'public/assets/logo-cliente.jpg', 'public/assets/logo-cliente.png', 'public/assets/logo-cliente.webp',
    'dist/assets/logo-cliente.jpg', 'dist/assets/logo-cliente.png', 'dist/assets/logo-cliente.webp',
    'public/branding/delicias/logo-original.svg', 'public/branding/delicias/cozinheira.svg', 'public/branding/delicias/totem.svg',
    'dist/branding/delicias/logo-original.svg', 'dist/branding/delicias/cozinheira.svg', 'dist/branding/delicias/totem.svg',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file + ' should be removed');
  }
  assert.equal(fs.existsSync(path.join(root, 'public/logo/qradmin-mark.png')), true);
});
