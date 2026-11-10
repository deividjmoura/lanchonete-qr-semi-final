'use strict';

/**
 * O `dist/` versionado precisa ser um build de PRODUÇÃO.
 *
 * `npm start` não roda build: a produção serve o `dist/` que está no
 * repositório. E o Vite lê o `.env` local — se ele tiver a linha
 * `NODE_ENV=development` (comum em quem roda o servidor na própria máquina),
 * `npm run build` passa a gerar o build de DESENVOLVIMENTO sem avisar. O
 * resultado funciona e tem a mesma aparência, por isso ninguém nota:
 *
 *   - o JavaScript quase dobra (o React de desenvolvimento vai junto);
 *   - o StrictMode dispara os efeitos em dobro, então cada tela faz as
 *     chamadas à API duas vezes;
 *   - o caminho das pastas da máquina de quem gerou fica escrito no arquivo.
 *
 * Aconteceu durante o rebranding de 11/2026 e foi pego por acaso, numa
 * mensagem do console. Este teste existe para que a próxima vez não dependa
 * de sorte. Correção: `NODE_ENV=production npm run build`.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const pasta = path.join(root, 'dist', 'assets');

/** Marcas que só existem no build de desenvolvimento. */
const MARCAS = [
  { marca: 'Download the React DevTools', oQueE: 'React de desenvolvimento' },
  { marca: 'jsxDEV', oQueE: 'JSX compilado em modo de desenvolvimento' },
];

function bundles() {
  assert.ok(fs.existsSync(pasta), 'dist/assets precisa existir: rode `NODE_ENV=production npm run build`');
  const nomes = fs.readdirSync(pasta).filter((nome) => nome.endsWith('.js'));
  assert.ok(nomes.length >= 1, 'dist/assets precisa conter o JavaScript do SPA');
  return nomes.map((nome) => ({ nome, codigo: fs.readFileSync(path.join(pasta, nome), 'utf8') }));
}

test('dist/ versionado é build de produção, não de desenvolvimento', () => {
  const achados = [];
  for (const { nome, codigo } of bundles()) {
    for (const { marca, oQueE } of MARCAS) {
      if (codigo.includes(marca)) achados.push(`dist/assets/${nome}: ${oQueE} ("${marca}")`);
    }
  }
  assert.deepEqual(
    achados,
    [],
    'dist/ foi gerado em modo de desenvolvimento (provável `NODE_ENV=development` no .env local). ' +
      'Gere de novo com `NODE_ENV=production npm run build`.',
  );
});

test('dist/ versionado não carrega o caminho das pastas de quem gerou', () => {
  /* O build de desenvolvimento grava em cada elemento o arquivo de origem com
     caminho absoluto (`fileName: "/home/fulano/projeto/src/App.tsx"`). */
  const caminhoLocal = /(?:\/home\/|\/Users\/|[A-Za-z]:\\\\Users\\\\)[^"'`\s]{0,200}?[\\/]src[\\/][^"'`\s]{1,200}?\.(?:tsx?|jsx?)/;
  const achados = [];
  for (const { nome, codigo } of bundles()) {
    const achado = codigo.match(caminhoLocal);
    if (achado) achados.push(`dist/assets/${nome}: ${achado[0].slice(0, 120)}`);
  }
  assert.deepEqual(achados, [], 'dist/ expõe caminhos da máquina de quem gerou: gere de novo com `NODE_ENV=production npm run build`.');
});
