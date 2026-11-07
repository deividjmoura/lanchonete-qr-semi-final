'use strict';

// Regressão: o domínio oficial do QR Admin passou a ser
// https://qradmin.up.railway.app (com um único "n" em "admin").
//
// O endereço antigo (qradminn.up.railway.app) aparecia no README, nas páginas
// institucionais, nos docs de operação/OAuth, no healthcheck de produção e nos
// testes de configuração. Este teste impede que ele volte por engano, porque um
// host inexistente quebra legal/SEO, o healthcheck do Railway e o callback do
// Google OAuth.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

const DOMINIO_NOVO = 'qradmin.up.railway.app';
const DOMINIO_ANTIGO = /qradminn\.up\.railway\.app/i;

const arquivosComEndereco = [
  'README.md',
  'public/apresentacao.html',
  'public/guia-sistema.html',
  'docs/FORNECEDOR-E-SERVICOS-QR-ADMIN.md',
  'docs/engineering/PRODUCTION_OPERATIONS_RUNBOOK.md',
  'docs/engineering/execucao-fase-2.md',
  'docs/engineering/google-oauth-setup.md',
  '.github/workflows/production-healthcheck.yml',
  'scripts/dia-inteiro.js',
  'tests/oauth-google.test.cjs',
  'tests/postgres-google-oauth-flow.test.cjs',
];

test('endereço oficial do sistema usa um único "n" em admin', () => {
  for (const arquivo of arquivosComEndereco) {
    const conteudo = ler(arquivo);
    assert.match(conteudo, new RegExp(DOMINIO_NOVO.replace(/\./g, '\\.')), `${arquivo} publica o domínio atual`);
    assert.doesNotMatch(conteudo, DOMINIO_ANTIGO, `${arquivo} não pode manter o domínio antigo`);
  }
});

test('páginas institucionais canônicas e Open Graph apontam para o domínio atual', () => {
  for (const pagina of ['public/apresentacao.html', 'public/guia-sistema.html']) {
    const conteudo = ler(pagina);
    for (const [, url] of conteudo.matchAll(/content="(https:\/\/[^"]*up\.railway\.app[^"]*)"/g)) {
      assert.ok(url.startsWith(`https://${DOMINIO_NOVO}`), `${pagina}: ${url} usa o domínio atual`);
    }
    for (const [, url] of conteudo.matchAll(/href="(https:\/\/[^"]*up\.railway\.app[^"]*)"/g)) {
      assert.ok(url.startsWith(`https://${DOMINIO_NOVO}`), `${pagina}: ${url} usa o domínio atual`);
    }
  }
});

test('healthcheck de produção consulta o host atual', () => {
  const workflow = ler('.github/workflows/production-healthcheck.yml');
  for (const [, url] of workflow.matchAll(/HEALTHCHECK_URL:\s*(\S+)/g)) {
    assert.equal(url, `https://${DOMINIO_NOVO}/healthz`);
  }
});
