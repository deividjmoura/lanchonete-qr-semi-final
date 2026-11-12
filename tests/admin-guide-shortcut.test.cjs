'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const shell = read('src/components/OpsShell.tsx');
const ui = read('src/components/ui.tsx');
const router = read('src/router.tsx');
const app = read('src/App.tsx');
const server = read('server.js');
const guidePath = path.join(root, 'public', 'guia-sistema.html');
const guide = fs.readFileSync(guidePath, 'utf8');

test('o atalho do admin abre o guia; os outros perfis mantêm Página inicial', () => {
  const navStart = shell.indexOf('<nav className="ops-toolbar-dock"');
  const navEnd = shell.indexOf('</nav>', navStart);
  assert.ok(navStart >= 0 && navEnd > navStart, 'barra de ações rápidas presente');
  const toolbar = shell.slice(navStart, navEnd);

  assert.match(toolbar, /role === "admin" \? \(/);
  assert.match(toolbar, /<IconBtn label="Ajuda: guia do sistema" onClick=\{\(\) => window\.location\.assign\("\/guia-sistema\.html"\)\}>/);
  assert.match(toolbar, /<Question size=\{20\} \/>/);
  assert.match(toolbar, /<IconBtn label="Página inicial" onClick=\{\(\) => ir\("\/"\)\}><House size=\{20\} \/><\/IconBtn>/);
  assert.match(ui, /aria-label=\{label\}/);
  assert.match(ui, /title=\{label\}/);

  // O botão de marca é outro atalho: continua levando admin ao dashboard.
  assert.match(shell, /if \(role === "admin"\) ir\("\/admin"\)/);
});

test('o guia estático não passa por redirecionamento nem gate de autenticação', () => {
  assert.ok(fs.existsSync(guidePath));
  assert.match(guide, /<title>Guia do sistema · QR Admin<\/title>/);

  const authStart = server.indexOf('/* auth de páginas legadas');
  const authEnd = server.indexOf("if (!hasSpa && p === '/')", authStart);
  assert.ok(authStart >= 0 && authEnd > authStart, 'bloco de autorização legado presente');
  assert.doesNotMatch(server.slice(authStart, authEnd), /guia-sistema\.html/);

  const redirectsStart = server.indexOf('const legacyParaSpa = {');
  const redirectsEnd = server.indexOf('};', redirectsStart);
  assert.ok(redirectsStart >= 0 && redirectsEnd > redirectsStart, 'mapa de redirects legado presente');
  assert.doesNotMatch(server.slice(redirectsStart, redirectsEnd), /guia-sistema\.html/);
  assert.match(server, /const publicRoot = path\.resolve\(ROOT, 'public'\)/);
  assert.match(server, /const data = await fs\.promises\.readFile\(fp\);[\s\S]*?return send\(res, 200, mime\[path\.extname\(fp\)\]/);
});

test('a raiz do SPA continua mostrando a Home pública', () => {
  assert.match(router, /return \{ path: segs\[0\] \|\| "home", params \}/);
  assert.match(app, /\{rota\.path === "home" && <Landing \/>\}/);
});
