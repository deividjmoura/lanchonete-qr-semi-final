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
 *   - o JavaScript fica quase 50% maior (medido: 986.660 → 1.437.097 bytes),
 *     porque o React de desenvolvimento vai junto;
 *   - o StrictMode dispara os efeitos em dobro, então as telas repetem
 *     chamadas à API (a captura das telas registrou 57 respostas em vez de 34);
 *   - o caminho das pastas da máquina de quem gerou fica escrito no arquivo.
 *
 * Aconteceu durante o rebranding de 11/2026 e foi pego por acaso, numa
 * mensagem do console. Este teste existe para que a próxima vez não dependa
 * de sorte. Correção: `NODE_ENV=production npm run build`.
 *
 * O QUE ESTE TESTE LÊ: o `dist/` que está no Git — o índice, isto é, o que já
 * passou por `git add` —, e não a pasta em disco. O motivo é o CI: os jobs
 * rodam com `NODE_ENV=test`, e o passo "Build" regrava a pasta `dist/` nesse
 * modo (que também embute o React de desenvolvimento) antes dos testes de
 * regressão. Aquela pasta é descartável; a que vai para o ar é a do commit.
 * Consequência para quem roda na própria máquina: um build recém-gerado só é
 * conferido depois de `git add dist`.
 *
 * Fora de um repositório Git (cópia exportada do projeto), lê a pasta em disco.
 */

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
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

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** `true` quando esta pasta é a raiz de um repositório Git (e não uma cópia
    exportada, nem uma subpasta solta dentro de outro repositório). */
function projetoEstaNoGit() {
  try {
    const topo = git(['rev-parse', '--show-toplevel']).trim();
    return fs.realpathSync(topo) === fs.realpathSync(root);
  } catch {
    return false;
  }
}

/** JavaScript de `dist/assets` como está no índice do Git. Em um merge com
    conflito o mesmo caminho aparece em mais de um estágio: todos são lidos,
    porque qualquer um deles pode acabar no commit. */
function bundlesDoGit() {
  const entradas = git(['ls-files', '--stage', '-z', '--', 'dist/assets']).split('\0').filter(Boolean);
  const bundles = [];
  for (const entrada of entradas) {
    const tab = entrada.indexOf('\t');
    const [, objeto, estagio] = entrada.slice(0, tab).split(' ');
    const caminho = entrada.slice(tab + 1);
    if (!caminho.endsWith('.js')) continue;
    const nome = caminho.slice('dist/assets/'.length) + (estagio === '0' ? '' : ` (conflito, estágio ${estagio})`);
    bundles.push({ nome, codigo: git(['cat-file', 'blob', objeto]) });
  }
  return bundles;
}

function bundlesDoDisco() {
  assert.ok(fs.existsSync(pasta), 'dist/assets precisa existir: rode `NODE_ENV=production npm run build`');
  return fs
    .readdirSync(pasta)
    .filter((nome) => nome.endsWith('.js'))
    .map((nome) => ({ nome, codigo: fs.readFileSync(path.join(pasta, nome), 'utf8') }));
}

function lerBundles() {
  const noGit = projetoEstaNoGit();
  const bundles = noGit ? bundlesDoGit() : bundlesDoDisco();
  const origem = noGit ? 'no Git' : 'em disco';
  assert.ok(
    bundles.length >= 1,
    `dist/assets ${origem} precisa conter o JavaScript do SPA: rode \`NODE_ENV=production npm run build\`` +
      (noGit ? ' e `git add dist`' : ''),
  );
  return { bundles, origem, comoCorrigir: `Gere de novo com \`NODE_ENV=production npm run build\`${noGit ? ' e refaça o `git add dist`' : ''}.` };
}

test('dist/ versionado é build de produção, não de desenvolvimento', () => {
  const { bundles, origem, comoCorrigir } = lerBundles();
  const achados = [];
  for (const { nome, codigo } of bundles) {
    for (const { marca, oQueE } of MARCAS) {
      if (codigo.includes(marca)) achados.push(`dist/assets/${nome}: ${oQueE} ("${marca}")`);
    }
  }
  assert.deepEqual(
    achados,
    [],
    `O dist/ que está ${origem} foi gerado em modo de desenvolvimento ` +
      `(provável \`NODE_ENV=development\` no .env local). ${comoCorrigir}`,
  );
});

test('dist/ versionado não carrega o caminho das pastas de quem gerou', () => {
  /* O build de desenvolvimento grava em cada elemento o arquivo de origem com
     caminho absoluto (`fileName: "/home/fulano/projeto/src/App.tsx"`). Aqui só
     são reconhecidas as pastas pessoais (/home, /Users, C:\Users), que são as
     que levam o nome de alguém; um build de desenvolvimento feito em outra
     pasta é pego pelo teste anterior. */
  const caminhoLocal = /(?:\/home\/|\/Users\/|[A-Za-z]:\\\\Users\\\\)[^"'`\s]{0,200}?[\\/]src[\\/][^"'`\s]{1,200}?\.(?:tsx?|jsx?)/;
  const { bundles, origem, comoCorrigir } = lerBundles();
  const achados = [];
  for (const { nome, codigo } of bundles) {
    const achado = codigo.match(caminhoLocal);
    if (achado) achados.push(`dist/assets/${nome}: ${achado[0].slice(0, 120)}`);
  }
  assert.deepEqual(achados, [], `O dist/ que está ${origem} expõe caminhos da máquina de quem gerou. ${comoCorrigir}`);
});
