'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { obterVersaoBuild } = require('../lib/build-version');

test('a versão do build é estável para o mesmo HTML compilado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-build-version-'));
  const file = path.join(dir, 'index.html');
  try {
    fs.writeFileSync(file, '<script src="/assets/app-a1.js"></script>');
    const primeira = obterVersaoBuild(file);
    assert.match(primeira, /^[a-f0-9]{16}$/);
    assert.equal(obterVersaoBuild(file), primeira);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a versão muda quando o HTML aponta para outro build', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-build-version-'));
  const file = path.join(dir, 'index.html');
  try {
    fs.writeFileSync(file, '<script src="/assets/app-a1.js"></script>');
    const anterior = obterVersaoBuild(file);
    fs.writeFileSync(file, '<script src="/assets/app-b2.js"></script>');
    assert.notEqual(obterVersaoBuild(file), anterior);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('retorna null quando o build ainda não existe', () => {
  assert.equal(obterVersaoBuild(path.join(os.tmpdir(), 'qr-build-inexistente', 'index.html')), null);
});
