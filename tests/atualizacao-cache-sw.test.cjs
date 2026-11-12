'use strict';

/**
 * Estratégia de cache e convivência com o service worker (#301).
 *
 * Regras da issue que este arquivo trava:
 *  - atualizar precisa trazer assets novos, sem ficar preso no cache antigo;
 *  - respeitar a política atual do SW: cache apenas do shell estático do PWA
 *    do garçom, nunca de `/api/`;
 *  - se o build servir o shell, ele não pode ser cacheado por anos;
 *  - nada de limpar IndexedDB/localStorage/fila offline como "estratégia de
 *    atualização", e nada de alterar a versão do cache do PWA sem revisar.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cacheControlForArquivoDoShell, cacheControlForStaticAsset } = require('../server/http-response');

const RAIZ = path.join(__dirname, '..');
const ler = (relativo) => fs.readFileSync(path.join(RAIZ, relativo), 'utf8');

test('shell e manifesto de versão nunca ficam presos em cache', () => {
  assert.equal(cacheControlForArquivoDoShell('/index.html'), 'no-store');
  assert.equal(cacheControlForArquivoDoShell('/build-version.json'), 'no-store');
  // Rota raiz servida como SPA também precisa revalidar.
  assert.equal(cacheControlForArquivoDoShell('/'), 'no-store');
  assert.equal(cacheControlForArquivoDoShell('/#/cozinha'), 'no-store');
});

test('assets com hash continuam imutáveis (sem perder performance)', () => {
  assert.equal(
    cacheControlForArquivoDoShell('/assets/index-BrVsED4o.js'),
    'public, max-age=31536000, immutable'
  );
  assert.equal(
    cacheControlForStaticAsset('/assets/index-Y2tGoD7i.css'),
    'public, max-age=31536000, immutable'
  );
  // Arquivo sem hash em /assets/ não pode ser imutável: nome não muda, conteúdo muda.
  assert.equal(cacheControlForStaticAsset('/assets/logo.png'), 'no-store');
});

test('servidor usa a política nova e serve o manifesto de versão', () => {
  const server = ler('server.js');
  assert.match(server, /cacheControlForArquivoDoShell\(p\)/);
  assert.match(server, /p === '\/build-version\.json'/);
  const bloco = server.slice(server.indexOf("p === '/api/version'"), server.indexOf("p === '/api/version'") + 1400);
  assert.match(bloco, /no-store/, 'o endpoint de versão não pode ser cacheado por CDN/navegador');
  // O manifesto é lido uma vez e serve AS DUAS superfícies (SPA e PWA do garçom).
  assert.match(bloco, /obterVersoesPublicadas\(path\.join\(ROOT, 'dist', ARQUIVO_VERSAO_BUILD\)\)/);
  // Nada sensível na resposta.
  assert.doesNotMatch(bloco, /process\.env/);
  assert.doesNotMatch(bloco, /SESSION|SECRET|TOKEN|PASSWORD|DATABASE_URL/i);
});

test('service worker do garçom continua escopado e sem cache de /api/', () => {
  const sw = ler('public/garcom-pwa/sw.js');
  // A versão do cache NÃO mudou nesta issue: revisar precache é outro trabalho.
  const cache = /const CACHE='(garcom-pwa-shell-v\d+)'/.exec(sw);
  assert.ok(cache, 'o nome do cache do PWA precisa continuar declarado');
  assert.match(sw, /if\s*\(\s*!url\.pathname\.startsWith\('\/garcom-pwa\/'\)\s*\)\s*return/);
  // Dentro do handler de fetch, o descarte de /api/ vem antes de qualquer
  // `cache.put`: o precache do install só toca o shell estático.
  const fetchHandler = sw.slice(sw.indexOf("self.addEventListener('fetch'"));
  const guardaApi = fetchHandler.indexOf("url.pathname.startsWith('/api/')");
  const primeiraEscrita = fetchHandler.indexOf('c.put(req,clone)');
  assert.ok(guardaApi > 0, 'o SW precisa ignorar /api/ explicitamente');
  assert.ok(primeiraEscrita > guardaApi, 'a checagem de /api/ precisa vir antes de qualquer cache.put');
  const shell = /const SHELL=\[([^\]]+)\]/.exec(sw);
  assert.ok(shell && !shell[1].includes('/api/'), 'o precache não pode conter rotas de API');
  // O aviso do Admin não é registrado no SPA: o SW é exclusivo do PWA do garçom.
  const main = ler('src/main.tsx');
  assert.doesNotMatch(main, /serviceWorker\.register/, 'não introduzir SW no shell do Admin nesta issue');
});

test('atualização não destrói dados locais nem força reload escondido', () => {
  const fonte = ler('src/components/AvisoAtualizacao.tsx');
  for (const proibido of [
    /indexedDB\.deleteDatabase/i,
    /localStorage\.clear/i,
    /sessionStorage\.clear/i,
    /caches\.delete/i,
    /navigator\.onLine/,
    /setTimeout\([^)]*reload/s,
    /location\.href\s*=/,
  ]) {
    assert.doesNotMatch(fonte, proibido, `estratégia proibida pela issue: ${proibido}`);
  }
  const vigia = ler('src/lib/atualizacao.ts');
  assert.doesNotMatch(vigia, /location\.reload\(/, 'o vigia não recarrega nada por conta própria');
  assert.doesNotMatch(vigia, /location\.href\s*=/, 'o vigia não navega por conta própria');
});

test('aviso é montado em todas as áreas operacionais e administrativas', () => {
  const app = ler('src/App.tsx');
  const montagem = /\[([^\]]+)\]\.includes\(rota\.path\) && <AvisoAtualizacao \/>/.exec(app);
  assert.ok(montagem, 'o aviso precisa continuar montado no App');
  const rotas = montagem[1].split(',').map((r) => r.trim().replace(/["']/g, '')).filter(Boolean);
  for (const rota of ['cozinha', 'bar', 'garcom', 'caixa', 'admin']) {
    assert.ok(rotas.includes(rota), `o aviso precisa aparecer em #/${rota}`);
  }
  // O cardápio do cliente ficou de fora de propósito (é outra superfície, com
  // cache e ciclo próprios) e a tela de login não tem operação em andamento.
  for (const rota of ['mesa', 'login', 'home']) {
    assert.ok(!rotas.includes(rota), `#/${rota} não deve carregar o aviso`);
  }
});
