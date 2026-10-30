'use strict';

/**
 * Regressão dos controles mortos do PWA do garçom.
 *
 * O E2E em navegador real revelou que vários botões existiam no HTML sem
 * nenhum handler: os dois "＋ Novo pedido", os "×" de fechar folha, o
 * "Atualizar" das mesas e TODA a navegação inferior. Na prática o garçom não
 * conseguia abrir um pedido nem chegar na aba Entregas pelo toque.
 *
 * Este teste garante que todo controle interativo do shell tenha ligação em
 * app.js, para que a falha não volte silenciosamente numa refatoração.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'public', 'garcom-pwa', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(raiz, 'public', 'garcom-pwa', 'app.js'), 'utf8');

/** ids de elementos que exigem interação direta do usuário. */
function idsDeControle() {
  const ids = [];
  const re = /<(button|input|select|textarea)\b[^>]*\bid="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) ids.push(m[2]);
  return [...new Set(ids)];
}

/** Um id está ligado se app.js o referencia por selector exato ou por dataset. */
function ligado(id) {
  return app.includes("'#" + id + "'") || app.includes('"#' + id + '"') || app.includes('`#' + id + '`');
}

test('todo botão/campo do shell do garçom tem handler em app.js', () => {
  const orfaos = idsDeControle().filter((id) => !ligado(id));
  assert.deepEqual(
    orfaos, [],
    'Controles sem nenhum handler (botão morto na tela): ' + orfaos.join(', ')
  );
});

test('navegação inferior chama switchTab para cada aba', () => {
  const abas = [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(abas.length >= 4, 'as quatro abas precisam existir no shell');
  for (const aba of ['tables', 'orders', 'deliveries', 'billing']) {
    assert.ok(abas.includes(aba), 'aba ausente do HTML: ' + aba);
  }
  assert.match(
    app,
    /querySelectorAll\('\[data-tab\]'\)[\s\S]{0,200}addEventListener\('click',\s*\(\)\s*=>\s*switchTab\(/,
    'os botões de aba precisam estar ligados ao switchTab'
  );
});

test('abrir pedido e fechar folhas modais estão ligados', () => {
  assert.match(app, /\$\('#newOrderTables'\)\?\.addEventListener\('click',\s*\(\)\s*=>\s*openOrder\(\)\)/);
  assert.match(app, /\$\('#newOrderOrders'\)\?\.addEventListener\('click',\s*\(\)\s*=>\s*openOrder\(\)\)/);
  assert.match(app, /\$\('#closeOrder'\)\?\.addEventListener\('click',\s*\(\)\s*=>\s*\$\('#orderModal'\)\.close\(\)\)/);
  assert.match(app, /\$\('#closeQr'\)\?\.addEventListener\('click',\s*\(\)\s*=>\s*\$\('#qrModal'\)\.close\(\)\)/);
  assert.match(app, /\$\('#closeTableDetails'\)\?\.addEventListener\('click',\s*\(\)\s*=>\s*\$\('#tableDetailsModal'\)\.close\(\)\)/);
});

test('service worker versiona o cache quando o shell muda', () => {
  const sw = fs.readFileSync(path.join(raiz, 'public', 'garcom-pwa', 'sw.js'), 'utf8');
  const versao = sw.match(/const CACHE='garcom-pwa-shell-v(\d+)'/);
  assert.ok(versao, 'cache do shell precisa ser versionado');
  assert.ok(Number(versao[1]) >= 18, 'mudanças no app.js exigem cache novo para não servir JS antigo');
  // O shell precisa incluir o módulo offline, senão o boot falha sem rede.
  assert.match(sw, /'\.\/offline\.js'/);
  assert.match(sw, /network-first|Network-first/i);
});
