'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

for (const [file, count] of [['public/apresentacao.html', 10], ['public/guia-sistema.html', 6]]) {
  test(`${file}: capturas reais, dimensões, acessibilidade e ausência de placeholders`, async () => {
    const html = read(file);
    const images = [...html.matchAll(/<img\b[^>]*src="\/assets\/apresentacao\/([^"]+)"[^>]*>/g)];
    assert.equal(images.length, count);
    assert.doesNotMatch(html, /frame-placeholder|Captura pendente|Placeholder:/);
    for (const [tag, name] of images) {
      assert.match(tag, /alt="[^"]+"/);
      const width = Number(tag.match(/width="(\d+)"/)[1]);
      const height = Number(tag.match(/height="(\d+)"/)[1]);
      const metadata = await sharp(path.join(root, 'public/assets/apresentacao', name)).metadata();
      assert.equal(metadata.format, 'webp');
      assert.equal(metadata.width, width);
      assert.equal(metadata.height, height);
      if (file.includes('guia') || name !== 'cardapio-cliente.webp') assert.match(tag, /loading="lazy"/);
      else { assert.match(tag, /fetchpriority="high"/); assert.doesNotMatch(tag, /loading="lazy"/); }
    }
    assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  });
}

for (const file of ['scripts/seed-apresentacao.cjs', 'scripts/capturar-apresentacao.mjs']) {
  test(`${file}: guarda recusa bancos compartilhados, remotos e overrides em parâmetros`, () => {
    const source = read(file);
    const start = source.indexOf('function validarBancoLocal(');
    const end = source.indexOf('\n}', start) + 2;
    const validate = vm.runInNewContext(`(${source.slice(start, end)})`, { URL });
    assert.doesNotThrow(() => validate('postgres://u:p@127.0.0.1:55433/qradmin_apresentacao_test', 'test'));
    for (const url of [
      'postgres://u:p@127.0.0.1/qradmin_test',
      'postgres://u:p@example.com/qradmin_apresentacao_test',
      'postgres://u:p@127.0.0.1/producao',
      'postgres://u:p@127.0.0.1/qradmin_apresentacao_test?host=example.com',
      'https://127.0.0.1/qradmin_apresentacao_test',
    ]) assert.throws(() => validate(url, 'test'), url);
    if (file.endsWith('.cjs')) {
      assert.throws(() => validate('postgres://u:p@127.0.0.1/qradmin_apresentacao_test', 'production'));
      assert.match(source, /process\.env\.DEMO_RESET_CONFIRM !== 'APAGAR_qradmin_apresentacao_test'/);
      assert.ok(source.indexOf('DEMO_RESET_CONFIRM') < source.indexOf("require('pg')"));
    }
  });
}
