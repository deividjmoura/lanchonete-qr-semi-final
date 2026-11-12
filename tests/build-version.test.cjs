'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { obterVersaoBuild } = require('../lib/build-version');

test('lê a versão gerada pelo build com formato válido', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-build-version-'));
  const file = path.join(dir, 'build-version.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ version: '0123456789abcdef' }));
    assert.equal(obterVersaoBuild(file), '0123456789abcdef');
    assert.equal(obterVersaoBuild(file), '0123456789abcdef');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rejeita arquivo ausente, JSON inválido ou versão fora do formato', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-build-version-'));
  const file = path.join(dir, 'build-version.json');
  try {
    assert.equal(obterVersaoBuild(file), null);
    fs.writeFileSync(file, '{inválido');
    assert.equal(obterVersaoBuild(file), null);
    fs.writeFileSync(file, JSON.stringify({ version: 'versao-invalida' }));
    assert.equal(obterVersaoBuild(file), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
