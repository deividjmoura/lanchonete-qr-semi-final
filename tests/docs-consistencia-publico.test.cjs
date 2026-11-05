'use strict';

/**
 * Consistência entre documentação viva, código do Service Worker e cópias em `dist/`.
 *
 * Histórico do problema: `docs/PWA-ATENDIMENTO-GARCOM.md` continuou dizendo
 * `garcom-pwa-shell-v18` por dezenas de versões, enquanto o `sw.js` já estava na
 * v38 — a documentação orientava a equipe a conferir um cache que não existia
 * mais. O teste existente de `tests/pwa-garcom-simplificado.test.cjs` só garante
 * que a versão do código é maior que a v37; ninguém comparava doc com código.
 *
 * Aqui os documentos "vivos" (que descrevem o comportamento atual) precisam citar
 * exatamente a versão declarada em `public/garcom-pwa/sw.js`. Documentos datados
 * de diagnóstico/auditoria ficam de fora de propósito: eles registram o estado de
 * uma data e devem continuar citando a versão daquela data.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

/** Documentos que precisam acompanhar o código atual. */
const DOCS_VIVOS = [
  'docs/PWA-ATENDIMENTO-GARCOM.md',
  'docs/engineering/data-policy-proposal.md',
];

/** Cópias publicadas que precisam ser idênticas às originais em `public/`. */
const COPIAS_LEGAIS = ['termos-de-servico.html', 'politica-de-privacidade.html'];

function versaoDoCodigo() {
  const sw = ler('public/garcom-pwa/sw.js');
  const m = sw.match(/const CACHE='garcom-pwa-shell-v(\d+)'/);
  assert.ok(m, "public/garcom-pwa/sw.js precisa declarar const CACHE='garcom-pwa-shell-vNN'");
  return Number(m[1]);
}

test('documentos vivos citam a mesma versão de cache declarada no service worker', () => {
  const versao = versaoDoCodigo();
  assert.ok(Number.isInteger(versao) && versao > 0, 'versão de cache legível');

  for (const doc of DOCS_VIVOS) {
    const linhas = ler(doc).split('\n');
    const mencoes = [];
    linhas.forEach((linha, indice) => {
      for (const m of linha.matchAll(/garcom-pwa-shell-v(\d+)/g)) {
        mencoes.push({ versao: Number(m[1]), linha: indice + 1 });
      }
    });

    assert.ok(mencoes.length > 0, `${doc} precisa citar a versão do cache do shell`);
    for (const mencao of mencoes) {
      assert.equal(
        mencao.versao,
        versao,
        `${doc}:${mencao.linha} cita garcom-pwa-shell-v${mencao.versao}, mas o sw.js está na v${versao}. ` +
          'Ao subir o cache, atualize os documentos vivos na mesma mudança.'
      );
    }
  }
});

test('cópias legais em dist/ são idênticas às de public/', () => {
  const dist = path.join(raiz, 'dist');
  if (!fs.existsSync(dist)) {
    // Árvore sem build (por exemplo, antes de `npm run build`): nada a comparar.
    return;
  }
  for (const arquivo of COPIAS_LEGAIS) {
    const publicado = path.join(dist, arquivo);
    if (!fs.existsSync(publicado)) continue;
    assert.equal(
      fs.readFileSync(publicado, 'utf8'),
      fs.readFileSync(path.join(raiz, 'public', arquivo), 'utf8'),
      `dist/${arquivo} precisa ser cópia exata de public/${arquivo}`
    );
  }
});

test('as páginas legais identificam o fornecedor real sem expor dados pessoais desnecessários', () => {
  const juntas = COPIAS_LEGAIS.map((arquivo) => ler(`public/${arquivo}`)).join('\n');

  assert.match(juntas, /69\.987\.201 DEIVID DE JESUS DE MOURA/);
  assert.match(juntas, /69\.987\.201\/0001-20/, 'deve usar o CNPJ confirmado no CCMEI');
  assert.match(juntas, /deividmoura729249@gmail\.com/);
  assert.doesNotMatch(juntas, /073\.749\.559-60/, 'CPF do titular não deve ser publicado');
  assert.doesNotMatch(juntas, /mantidos por \d+ (dias|meses|anos)/i, 'prazo de retenção não pode ser inventado');
  assert.match(ler('public/politica-de-privacidade.html'), /controlador dos dados pessoais.*estabelecimento/i);
  assert.match(ler('public/politica-de-privacidade.html'), /fornecedor do software não se torna controlador/i);
  // O token do garçom precisa ser descrito como bearer no navegador, não como cookie HttpOnly.
  assert.match(juntas, /token de acesso do tipo bearer armazenado no navegador, não um cookie HttpOnly/);
  // Rascunho offline não é pedido recebido: a distinção precisa existir nos dois arquivos.
  assert.match(ler('public/termos-de-servico.html'), /não é considerado recebido pela cozinha\/bar/);
  assert.match(ler('public/politica-de-privacidade.html'), /respostas da API não são armazenadas em cache/);
});
