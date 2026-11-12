'use strict';

/**
 * Identificador de build publicado (#301).
 *
 * O ponto central: o valor que o SERVIDOR publica em `/api/version` e o valor
 * embutido no BUNDLE precisam sair da mesma fonte. Antes desta correção o
 * servidor lia um `dist/build-version.json` que não existia no repositório
 * (o `dist/` é versionado e servido como está), então o endpoint respondia 503
 * em produção e o aviso nunca aparecia.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ARQUIVO_VERSAO,
  FORMATO_VERSAO,
  calcularVersaoDoShell,
  obterVersaoBuild,
} = require('../lib/build-version');

const RAIZ = path.join(__dirname, '..');

test('lê a versão gerada pelo build com formato válido', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-build-version-'));
  const file = path.join(dir, 'build-version.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ version: '0123456789abcdef' }));
    assert.equal(obterVersaoBuild(file), '0123456789abcdef');
    // Leitura repetida: o endpoint não pode responder diferente a cada chamada.
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
    // Sem campo algum / tipo errado: nunca inventa versão.
    fs.writeFileSync(file, JSON.stringify({}));
    assert.equal(obterVersaoBuild(file), null);
    fs.writeFileSync(file, JSON.stringify({ version: 42 }));
    assert.equal(obterVersaoBuild(file), null);
    // SHA de 40 caracteres (o commit) não é o formato publicável.
    fs.writeFileSync(file, JSON.stringify({ version: 'a'.repeat(40) }));
    assert.equal(obterVersaoBuild(file), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('nome do manifesto é um só, compartilhado com o build', () => {
  assert.equal(ARQUIVO_VERSAO, 'build-version.json');
  const vite = fs.readFileSync(path.join(RAIZ, 'vite.config.ts'), 'utf8');
  // O build importa a mesma fórmula: nada de duas implementações de hash.
  assert.match(vite, /from "\.\/lib\/build-version\.js"/);
  assert.match(vite, /calcularVersaoDoShell\(__dirname\)/);
  assert.match(vite, /__BUILD_VERSION__/);
});

test('hash é estável, muda com o conteúdo e não depende do caminho', () => {
  const versao = calcularVersaoDoShell(RAIZ);
  assert.match(versao, FORMATO_VERSAO, 'identificador precisa ter 16 hex');
  assert.equal(calcularVersaoDoShell(RAIZ), versao, 'a mesma árvore precisa gerar o mesmo hash');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-shell-'));
  try {
    const fonte = (nome, conteudo) => {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', nome), conteudo);
    };
    fs.writeFileSync(path.join(dir, 'index.html'), '<div id="root"></div>');
    fonte('a.tsx', 'export const a = 1;\n');
    const antes = calcularVersaoDoShell(dir);

    // Conteúdo igual, inclusive a ordem de escrita trocada → mesmo hash.
    fs.rmSync(path.join(dir, 'src'), { recursive: true, force: true });
    fonte('a.tsx', 'export const a = 1;\n');
    assert.equal(calcularVersaoDoShell(dir), antes, 'ordem de leitura não pode mudar o hash');

    fonte('a.tsx', 'export const a = 2;\n');
    const depois = calcularVersaoDoShell(dir);
    assert.notEqual(depois, antes, 'mudar o bundle precisa gerar versão nova');
    // O "deploy" que muda só servidor não altera o shell → não avisa à toa.
    fs.writeFileSync(path.join(dir, 'server.js'), '// mudou só o servidor\n');
    assert.equal(calcularVersaoDoShell(dir), depois, 'mudança só no servidor não muda a versão');

    // O changelog é servido fora do bundle, mas mudar as notas precisa gerar
    // uma versão nova para que abas abertas recebam o aviso.
    fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'public', 'novidades.json'), '{"notas":[]}\n');
    const comChangelog = calcularVersaoDoShell(dir);
    fs.writeFileSync(path.join(dir, 'public', 'novidades.json'), '{"notas":[{"versao":"1.1.0"}]}\n');
    assert.notEqual(calcularVersaoDoShell(dir), comChangelog, 'mudar o changelog precisa gerar versão nova');
    assert.match(calcularVersaoDoShell(dir), FORMATO_VERSAO);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dist/build-version.json commitado corresponde ao shell no repositório', () => {
  const publicado = path.join(RAIZ, 'dist', ARQUIVO_VERSAO);
  assert.ok(
    fs.existsSync(publicado),
    'dist/build-version.json precisa existir no repositório: o deploy serve o dist/ versionado "como está" ' +
      'e, sem o arquivo, /api/version responde 503 e nenhum aviso aparece em produção'
  );
  const versao = obterVersaoBuild(publicado);
  assert.ok(versao, 'manifesto de versão inválido no dist/');
  assert.equal(
    versao,
    calcularVersaoDoShell(RAIZ),
    'o manifesto commitado ficou para trás: rode `NODE_ENV=production npm run build` e commite o dist/'
  );

  // O bundle servido precisa carregar o MESMO identificador (é o que a aba
  // compara com a resposta da API).
  const html = fs.readFileSync(path.join(RAIZ, 'dist', 'index.html'), 'utf8');
  const entrada = /src="\/assets\/(index-[^"]+\.js)"/.exec(html);
  assert.ok(entrada, 'index.html do dist/ precisa apontar para o bundle do SPA');
  const bundle = fs.readFileSync(path.join(RAIZ, 'dist', 'assets', entrada[1]), 'utf8');
  assert.ok(
    bundle.includes(versao),
    'o bundle do dist/ não contém a versão publicada: o aviso apareceria para sempre (ou nunca)'
  );
  assert.ok(bundle.includes('/api/version'), 'o bundle precisa consultar /api/version');
});
