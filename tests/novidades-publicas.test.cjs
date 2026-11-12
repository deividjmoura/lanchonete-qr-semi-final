'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ler = (arquivo) => fs.readFileSync(path.join(root, arquivo), 'utf8');

test('histórico público usa a fonte única de notas e o padrão institucional', () => {
  const html = ler('public/novidades.html');
  assert.match(html, /pagina--documento/);
  assert.match(html, /institucional\.css/);
  assert.match(html, /theme-init\.js/);
  assert.match(html, /fetch\('\/novidades\.json'/);
  assert.match(html, /textContent/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /qradmin\.up\.railway\.app\/novidades\.html/);
});

test('landing e login oferecem acesso público ao histórico', () => {
  assert.match(ler('src/screens/Login.tsx'), /href="\/novidades\.html"/);
  assert.match(ler('public/apresentacao.html'), /href="\/novidades\.html"/);
});

test('a página pública não depende de autenticação nem da rota interna do painel', () => {
  const html = ler('public/novidades.html');
  assert.doesNotMatch(html, /OpsShell|fetch\('\/api\//);
  assert.match(html, /\/novidades\.json/);
});
