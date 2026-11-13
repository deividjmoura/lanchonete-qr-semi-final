'use strict';

/**
 * `dist/` deixou de ser versionado por inteiro em 13/11/2026: só o bundle com
 * hash, o `build-version.json` e o shell do garçom continuam no Git, porque o
 * `vite preview` dos E2E e `verificar-cardapio-intacto.mjs` servem o diretório
 * como raiz de documento.
 *
 * A consequência perigosa: `server.js` serve o SPA de `dist/` **se existir** e,
 * quando não existe, cai silenciosamente nos HTML legados de `public/`. Um
 * deploy que esqueça o build entregaria a interface antiga com HTTP 200 — sem
 * erro, sem log, sem alarme. Estes testes cobrem a trava que fecha esse buraco
 * e a regra de que `dist/` só contém o que o build gera.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { exigirBuildDoFrontend } = require('../lib/exigir-build');

const RAIZ = path.join(__dirname, '..');

/** Diretório temporário que imita a raiz do projeto com/sem build. */
function comDist(temBuild) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exigir-build-'));
  if (temBuild) {
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html>');
  }
  return dir;
}

test('produção com build presente segue normalmente', () => {
  const dir = comDist(true);
  assert.equal(exigirBuildDoFrontend({ root: dir, env: { NODE_ENV: 'production' } }), true);
});

test('produção sem build recusa iniciar (não serve a interface antiga)', () => {
  const dir = comDist(false);
  const original = console.error;
  const dito = [];
  console.error = (...a) => dito.push(a.join(' '));
  try {
    assert.equal(exigirBuildDoFrontend({ root: dir, env: { NODE_ENV: 'production' } }), false);
  } finally {
    console.error = original;
  }
  const mensagem = dito.join('\n');
  assert.match(mensagem, /Build do frontend ausente/);
  // A mensagem precisa dizer o que fazer: quem lê o log do deploy está com pressa.
  assert.match(mensagem, /npm run build/);
  assert.match(mensagem, /FRONTEND_BUILD_REQUIRED=0/);
});

test('fora de produção a ausência do build não derruba os testes de integração', () => {
  /* As suítes postgres-* sobem o server.js real com NODE_ENV=test e só falam
     com /api/**. Exigir build ali quebraria a integração inteira sem ganho. */
  const dir = comDist(false);
  for (const env of [{ NODE_ENV: 'test' }, { NODE_ENV: 'development' }, {}]) {
    assert.equal(exigirBuildDoFrontend({ root: dir, env }), true, JSON.stringify(env));
  }
});

test('o server.js aplica a trava antes de aceitar tráfego', () => {
  const server = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  assert.match(server, /require\('\.\/lib\/exigir-build'\)/);
  // A checagem precisa estar no callback do listen: é o momento em que o
  // processo passa a responder. Checar antes de criar o handler não cobriria
  // um deploy que subiu sem build e já está no ar.
  const listen = server.slice(server.indexOf('server.listen('));
  assert.match(listen, /exigirBuildDoFrontend\(\{ root: __dirname \}\)/);
  assert.match(listen, /server\.close\(\)/, 'sem build, precisa parar de aceitar conexões');
  assert.match(listen, /process\.exitCode = 1/, 'sem build, o processo precisa terminar com erro');
  // Válvula de escape explícita, para quem quiser a degradação de propósito.
  assert.match(listen, /FRONTEND_BUILD_REQUIRED !== '0'/);
});

test('dist/ versionado contém apenas o que o build gera e o que é servido como raiz', () => {
  const arquivos = require('node:child_process')
    .execFileSync('git', ['ls-files', 'dist'], { cwd: RAIZ, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((f) => f.slice('dist/'.length));

  assert.ok(arquivos.length > 0, 'dist/ precisa estar no Git: é ele que a produção serve');

  /* O que pode ficar em dist/, e por quê:
     - index.html, build-version.json e o bundle/fontes hasheados: o server.js
       lê esses de dist/ (rotas de /assets/** e do manifesto de versão);
     - garcom-pwa/**: o shell instalável é servido por cópia e o `vite preview`
       dos E2E navega em /garcom-pwa/;
     - assets/apresentacao/**, assets/bg-* e assets/demo/**: imagens estáticas
       de página. O server.js as serve de public/, mas `verificar-cardapio-intacto.mjs`
       e o `vite preview` servem dist/ como raiz de documento única — sem elas
       o cardápio do cliente apareceria sem foto e a comparação de pixels
       falharia por motivo errado.

     O que NÃO pode voltar: HTML legado, CSS, JS, logo, favicons, fontes não
     hasheadas e novidades.json copiados de public/. Esses o server.js resolve
     sempre em public/ e a cópia só cria um segundo lugar para divergir. */
  const permitido = new RegExp(
    '^(' +
      [
        'index\\.html',
        'build-version\\.json',
        'garcom-pwa\\/.+',
        'assets\\/(index|react|motion|icons)-[A-Za-z0-9_-]+\\.(js|css)',
        'assets\\/[A-Za-z0-9_-]+\\.woff2',
        'assets\\/(apresentacao|demo)\\/[^/]+',
        'assets\\/bg-[a-z]+\\.webp',
      ].join('|') +
      ')$',
  );
  const fora = arquivos.filter((a) => !permitido.test(a));
  assert.deepEqual(
    fora,
    [],
    'dist/ guarda o build e o que é servido com dist/ como raiz de documento. ' +
      'Cópias de public/ que o server.js resolve em public/ não devem ficar aqui: ' +
      'só criam um segundo lugar para divergir. Remova: ' +
      fora.join(', '),
  );
});

test('os arquivos que o server.js lê de dist/ continuam versionados', () => {
  /* A regra acima é uma allowlist; este teste garante o outro lado: o que o
     server.js realmente abre em disco não pode ter saído junto. */
  for (const obrigatorio of ['dist/index.html', 'dist/build-version.json']) {
    assert.ok(fs.existsSync(path.join(RAIZ, obrigatorio)), `${obrigatorio} precisa existir: o server.js o serve`);
  }
  const html = fs.readFileSync(path.join(RAIZ, 'dist', 'index.html'), 'utf8');
  const entrada = /src="\/assets\/([^"]+\.js)"/.exec(html);
  assert.ok(entrada, 'dist/index.html precisa apontar para o bundle');
  assert.ok(
    fs.existsSync(path.join(RAIZ, 'dist', 'assets', entrada[1])),
    `o bundle ${entrada[1]} citado no index.html precisa existir em dist/assets/`,
  );
});
