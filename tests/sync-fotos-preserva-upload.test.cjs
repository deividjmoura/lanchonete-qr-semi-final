'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// Uploads do admin são gravados em produtos.foto_url como data:image/webp;base64
// (db/foto.js) e essa coluna é a única cópia. O sync de fotos de demonstração
// nunca pode tratá-los como "gerenciados" e sobrescrevê-los.
test('sync-fotos-seed preserva fotos data: enviadas pelo admin e roda em simulação por padrão', () => {
  const src = fs.readFileSync('scripts/sync-fotos-seed.js', 'utf8');
  const linha = src.split('\n').find((l) => /const managed\s*=/.test(l));
  assert.ok(linha, 'definição de "managed" não encontrada');
  assert.doesNotMatch(linha, /data:/, 'data: não pode ser tratado como foto gerenciada');
  assert.match(linha, /\/assets\/demo\//);
  assert.match(src, /process\.argv\.includes\('--apply'\)/, 'gravação exige --apply explícito');
});
