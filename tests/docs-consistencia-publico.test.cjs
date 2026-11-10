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
 *
 * O mesmo princípio vale para o que as páginas públicas afirmam sobre segurança
 * (o texto não pode negar uma capacidade que o código já tem) e para o rótulo das
 * abas clicadas pelos E2E — a aba "Senhas" virou "Logins" e derrubou o E2E de
 * redefinição de senha, porque nada ligava o texto do teste ao da interface.
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

test('a política de privacidade acompanha o que o admin realmente faz com o vínculo Google', () => {
  const admin = ler('db/admin.js');
  const paginas = ['public/politica-de-privacidade.html', 'public/termos-de-servico.html']
    .map((arquivo) => ler(arquivo))
    .join('\n');

  // Texto antigo, quando a remoção só limpava `email`: hoje seria mentira.
  assert.doesNotMatch(paginas, /não desvincula uma identidade Google/i);

  const desvincula = /google_sub = NULL/.test(admin);
  if (desvincula) {
    assert.match(
      ler('public/politica-de-privacidade.html'),
      /vínculo Google anterior é desfeito e as sessões dessa conta são encerradas/,
      'se o código desvincula o Google, a Política precisa dizer isso'
    );
    assert.match(ler('docs/engineering/data-policy-proposal.md'), /sessões daquela conta são revogadas/);
  }
});

test('o E2E de redefinição de senha clica no rótulo real da aba de logins', () => {
  const ui = ler('src/screens/Admin.tsx');
  const e2e = ler('tests/e2e/admin-redefine-senha.e2e.cjs');
  const rotulo = ui.match(/\{ id: "senhas" as const, label: "([^"]+)"/);
  assert.ok(rotulo, 'Admin.tsx declara a aba de senhas/logins');

  assert.ok(
    e2e.includes(`getByRole('button', { name: '${rotulo[1]}', exact: true })`),
    `o E2E precisa clicar na aba "${rotulo[1]}" — renomear a aba sem atualizar o teste deixa o CI vermelho`
  );
  assert.doesNotMatch(e2e, /name: 'Senhas', exact: true/, 'rótulo antigo da aba');
});

test('páginas legais seguem a identidade Comanda de Chapa e o contato institucional atual', () => {
  const paginas = ['public/politica-de-privacidade.html', 'public/termos-de-servico.html', 'public/termos-de-uso.html']
    .map((arquivo) => ler(arquivo));
  for (const pagina of paginas) {
    assert.match(pagina, /Fraunces/);
    assert.match(pagina, /Plus Jakarta Sans/);
    assert.match(pagina, /#17120e/i, 'stout da identidade');
    assert.match(pagina, /#e8501f/i, 'brasa da identidade');
    assert.match(pagina, /class="brand"/, 'assinatura QR Admin');
    assert.doesNotMatch(pagina, /#166534|#b7a5ff|#101626/i, 'sem paleta visual antiga');
  }
  assert.match(paginas[0], /mailto:servicosdegestaoqradmin@gmail\.com/);
  assert.match(paginas[1], /mailto:servicosdegestaoqradmin@gmail\.com/);
  assert.match(paginas[2], /mailto:servicosdegestaoqradmin@gmail\.com/);
});

test('a aba Logins renderiza uma única seção de redefinição de senha', () => {
  // A PR #254 uniu a aba Google à aba de senhas e deixou o bloco antigo no
  // lugar: a tela passou a mostrar "Redefinir senha de um setor" duas vezes e
  // o E2E morreu em strict mode. O painel é único e o botão também.
  const ui = ler('src/screens/Admin.tsx');
  const secoes = ui.match(/\{sub === "senhas" && \(/g) || [];
  assert.equal(secoes.length, 1, 'apenas uma seção `sub === "senhas"`');
  const botoes = ui.match(/Redefinir senha de um setor/g) || [];
  assert.equal(botoes.length, 1, 'apenas um botão "Redefinir senha de um setor"');
  assert.equal((ui.match(/<TrocarSenha obrigatorio/g) || []).length, 1);
});

test('as páginas legais identificam o fornecedor real sem expor dados pessoais desnecessários', () => {
  const juntas = COPIAS_LEGAIS.map((arquivo) => ler(`public/${arquivo}`)).join('\n');

  assert.match(juntas, /69\.987\.201 DEIVID DE JESUS DE MOURA/);
  assert.match(juntas, /69\.987\.201\/0001-20/, 'deve usar o CNPJ confirmado no CCMEI');
  assert.match(juntas, /servicosdegestaoqradmin@gmail\.com/);
  // Formato genérico: o CPF real nunca precisa aparecer no repositório, nem
  // dentro da asserção que o proíbe.
  assert.doesNotMatch(juntas, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, 'CPF não deve ser publicado');
  // Prazos definidos pelo responsável em 05/11/2026 (decisão registrada em
  // docs/engineering/data-policy-proposal.md §3.1). Eles só podem aparecer se
  // o texto também disser que dependem de validação contábil/jurídica.
  assert.match(juntas, /até 12 meses após o fechamento da conta/i);
  assert.match(juntas, /até 5 anos/);
  assert.match(juntas, /até 90 dias/);
  assert.match(
    ler('public/politica-de-privacidade.html'),
    /confirmad[oa]s? por contador e advogado/i,
    'prazo sem validação declarada vira promessa jurídica',
  );
  // Fornecedores só entram na Política se estiverem confirmados.
  assert.match(ler('public/politica-de-privacidade.html'), /Railway/);
  assert.match(ler('public/politica-de-privacidade.html'), /Google<\/strong> \(OAuth\/OpenID Connect\)/);
  // Região confirmada (us-east) caracteriza transferência internacional e
  // precisa estar dita; a ausência de DPA não pode ser escondida.
  assert.match(ler('public/politica-de-privacidade.html'), /região <strong>us-east<\/strong>.*Estados Unidos/);
  assert.match(
    ler('public/politica-de-privacidade.html'),
    /ainda não firmou com esse provedor um contrato específico de tratamento/i,
    'não declarar contrato de tratamento inexistente',
  );
  // O atendimento a titulares precisa dizer como o pedido é respondido.
  assert.match(ler('public/politica-de-privacidade.html'), /responde por escrito em até 15 dias/);
  // A revisão periódica da anonimização é decisão registrada, não promessa solta.
  assert.match(ler('public/politica-de-privacidade.html'), /revisa essa limpeza a cada <strong>90 dias<\/strong>/);
  // Nenhuma página pública pode depender de CDN de fonte de terceiro.
  for (const arquivo of ['public/mesa.html', 'public/garcom-pwa/index.html', 'index.html']) {
    assert.doesNotMatch(ler(arquivo), /fonts\.googleapis\.com|fonts\.gstatic\.com/, arquivo + ' sem Google Fonts');
  }
  assert.match(ler('public/mesa.html'), /\/mesa-fonts\.css/, 'fontes do cardápio são servidas pelo próprio domínio');
  assert.match(ler('public/politica-de-privacidade.html'), /controlador dos dados pessoais.*estabelecimento/i);
  assert.match(ler('public/politica-de-privacidade.html'), /fornecedor do software não se torna controlador/i);
  // O token do garçom precisa ser descrito como bearer no navegador, não como cookie HttpOnly.
  assert.match(juntas, /token de acesso do tipo bearer armazenado no navegador, não um cookie HttpOnly/);
  // Rascunho offline não é pedido recebido: a distinção precisa existir nos dois arquivos.
  assert.match(ler('public/termos-de-servico.html'), /não é considerado recebido pela cozinha\/bar/);
  assert.match(ler('public/politica-de-privacidade.html'), /respostas da API não são armazenadas em cache/);
});
