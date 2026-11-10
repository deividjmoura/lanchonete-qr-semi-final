// Contratos da reorganização da cozinha/bar: duas sessões recolhíveis
// (Em produção / Na fila), rolagem lateral de 2–3 linhas, ações por item e
// nenhuma coluna de "Prontos".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (p) => fs.readFileSync(p, 'utf8');
const cozinha = read('src/screens/Cozinha.tsx');
const bar = read('src/screens/Bar.tsx');
const fila = read('src/components/FilaProducao.tsx');
const css = read('src/screens/operacional.css');

test('cozinha e bar usam a fila compartilhada e não têm mais a coluna "Prontos"', () => {
  for (const [nome, fonte] of [['Cozinha', cozinha], ['Bar', bar]]) {
    assert.match(fonte, /<FilaProducao[\s\S]*setor="(cozinha|bar)"/, `${nome} usa FilaProducao`);
    assert.doesNotMatch(fonte, /Prontos/, `${nome} não tem coluna de prontos`);
    assert.doesNotMatch(fonte, /id:\s*"pronto"/, `${nome} não declara etapa pronto`);
    assert.doesNotMatch(fonte, /concluirPedido\(|aceitarPedido\(/, `${nome} não usa ação de pedido inteiro`);
    assert.match(fonte, /useAnuncios\("(cozinha|bar)"\)/, `${nome} mantém os anúncios de voz`);
    assert.match(fonte, /connectEvents\(/, `${nome} mantém o SSE`);
  }
});

test('as duas sessões começam recolhidas e podem ser abertas de forma independente', () => {
  assert.match(fila, /const FECHADAS: EstadoSessoes = \{ em_producao: false, na_fila: false \}/);
  assert.match(fila, /useState<EstadoSessoes>\(\(\) => lerPreferencia\(setor\)\)/);
  assert.match(fila, /aria-expanded=\{aberta\}/);
  assert.match(fila, /aria-controls=\{corpoId\}/);
  assert.match(fila, /hidden=\{!aberta\}/);
  assert.match(fila, /const proximo = \{ \.\.\.atual, \[etapa\]: !atual\[etapa\] \}/, 'cada seção alterna sozinha');
  assert.match(fila, /qradmin-fila-producao-abertas/);
  // O corpo recolhido nem renderiza os cartões: a tela fica leve com fila grande.
  assert.match(fila, /\{!aberta \? null :/);
});

test('a fila preenche a linha da esquerda para a direita e só desce no fim', () => {
  // Leitura em linha: 1ª comanda no canto superior esquerdo, as próximas para
  // a direita; ao acabar a linha, a próxima desce. Nada de coluna (cima→baixo)
  // nem de rolagem lateral escondendo o resto da fila.
  assert.doesNotMatch(css, /grid-auto-flow:\s*column/);
  assert.doesNotMatch(css, /grid-auto-columns/, 'sem trilho de colunas largas');
  assert.doesNotMatch(css, /scroll-snap-type:\s*x/, 'a fila não é mais um carrossel lateral');
  assert.doesNotMatch(css, /\.fila-dica/, 'sem dica de arraste lateral');
  assert.match(css, /\.fila-grade__cartoes \{\s*display: grid;/);
  assert.match(css, /grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 272px\), 1fr\)\)/);
  assert.match(css, /@media \(min-width: 1280px\)[\s\S]*?grid-template-columns: repeat\(auto-fill, minmax\(312px, 1fr\)\)/);
  assert.match(fila, /className="fila-grade"/);
  assert.match(fila, /className="fila-grade__cartoes"/);
});

test('telas pequenas continuam legíveis (320/375) e o movimento respeita reduced motion', () => {
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.fila-grade__cartoes \{\s*gap: 10px;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transform:\s*none !important/);
  assert.match(fila, /useReducedMotion\(\)/);
  assert.match(fila, /transition=\{\{ duration: reduceMotion \? 0 :/);
});

test('ação por item usa a rota de item; ação de comanda diz que é só desta etapa', () => {
  assert.match(fila, /api\.statusItem\(setor, id, alvo\)/);
  assert.doesNotMatch(fila, /api\.statusPedido/, 'nada de mexer no pedido inteiro');
  assert.match(fila, /onAvancar\(\[item\], etapaInfo\.proximo\)/);
  assert.match(fila, /Iniciar este item/);
  assert.match(fila, /Liberar este item/);
  assert.match(fila, /rotuloAcaoComanda\(etapa, itens\.length\)/);
  assert.match(fila, /desta comanda/);
  // Botões desabilitam durante a gravação para não duplicar toque.
  assert.match(fila, /ocupadosRef\.current/);
  assert.match(fila, /disabled=\{ocupado \|\| algumOcupado\}/);
});

test('identidade "Passe" nas telas ativas: comanda é ficha plana com régua de etapa', () => {
  for (const classe of ['ops-stage', 'ops-sessao', 'ops-card', 'ops-pill']) {
    assert.ok(css.includes('.' + classe), `classe ${classe} definida`);
  }
  // A camada visual não escreve cor literal: tudo vem de token.
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'operacional.css sem hex/rgba literais');
  assert.match(fila, /import "\.\.\/screens\/operacional\.css"/);

  // A comanda é uma ficha de papel: superfície opaca, contorno de 1px e a
  // régua da etapa no topo. Sem vidro, sem brilho interno, sem desfoque.
  const cartao = /\.ops-card \{([^}]*)\}/.exec(css);
  assert.ok(cartao, 'regra .ops-card');
  assert.match(cartao[1], /border: 1px solid var\(--line-strong\)/);
  assert.match(cartao[1], /border-top: 3px solid var\(--ops-accent\)/);
  assert.match(cartao[1], /border-radius: var\(--radius-md\)/);
  assert.match(cartao[1], /background: var\(--surface-raised\)/);
  assert.doesNotMatch(css, /backdrop-filter/, 'sem vidro');
  assert.doesNotMatch(css, /inset 0 1px 0/, 'sem brilho interno de vidro');
  assert.doesNotMatch(css, /var\(--stage-/, 'tokens do palco antigo não existem mais');

  // A cor da etapa vem de uma variável só, definida por estação.
  assert.match(css, /\.ops-stage \{\s*--ops-accent: var\(--route-active\);/);
  // Contraste: texto e texto secundário pelos tokens semânticos do tema.
  assert.match(css, /color:\s*var\(--text\)/);
  assert.match(css, /color:\s*var\(--text-muted\)/);
  // Atraso não depende só de cor: há uma faixa com texto além do contorno.
  assert.match(css, /\.ops-card\[data-atrasado="true"\] \{\s*border-color: var\(--status-danger\);/);
  assert.match(css, /\.ops-card__alerta \{[^}]*background: var\(--status-danger\);[^}]*color: var\(--status-danger-contrast\);/);
  assert.match(fila, /ops-card__alerta/);

  // Hierarquia das ações: a unidade é o item, então a ação do item é a
  // principal (tinta cheia) e a da comanda inteira é secundária (contorno).
  assert.match(css, /\.ops-card__acao \{\s*border-color: var\(--brand\);\s*background: var\(--brand\);\s*color: var\(--brand-contrast\);/);
  assert.doesNotMatch(css, /\.ops-card__todos \{[^}]*background: var\(--brand\)/, 'a ação da comanda não disputa com a do item');
});

test('a ficha do passe chega ao caixa, ao panorama e ao PWA sem perder contraste', () => {
  const passe = read('src/styles/passe.css');
  const caixa = read('src/screens/Caixa.tsx');
  const pwa = read('public/garcom-pwa/styles.css');
  const sw = read('public/garcom-pwa/sw.js');

  // Uma superfície de cartão para o produto inteiro, definida uma vez.
  assert.match(passe, /\.ficha,\s*\[data-ficha\] \{\s*background: var\(--surface-raised\);\s*box-shadow: var\(--shadow-card\);/);
  assert.match(passe, /button\.ficha:hover,\s*\[data-ficha\]:hover \{\s*border-color: var\(--line-strong\);\s*box-shadow: var\(--shadow-card-hover\);/);
  assert.equal((caixa.match(/"ficha |className="ficha /g) || []).length, 2, 'lista e comanda do caixa usam a ficha');
  assert.match(read('src/screens/admin/PanoramaMesas.tsx'), /<article\s+data-ficha\b/);

  // PWA do garçom: mesmo cartão plano, sem vidro.
  assert.match(pwa, /\.order \{[^}]*box-shadow: var\(--shadow-card\);/);
  assert.match(pwa, /\.order:hover \{[^}]*box-shadow: var\(--shadow-card-hover\);/);
  assert.doesNotMatch(pwa, /backdrop-filter/);
  assert.match(sw, /garcom-pwa-shell-v(3[3-9]|[4-9]\d)/, 'cache novo para os aparelhos pegarem o CSS');

  // Movimento: a página entra uma vez; os cartões não animam um a um. Quem
  // pede menos movimento não recebe nenhum.
  assert.match(passe, /\.anim-ticket \{\s*animation: passe-entrar var\(--dur-base\) var\(--ease-out\) both;/);
  assert.match(read('src/components/OpsShell.tsx'), /<main className="anim-ticket /);
  assert.doesNotMatch(passe, /\[data-ficha\][^{]*\{[^}]*animation:/, 'cartão não tem animação própria');
  assert.match(passe, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,200}animation-duration: 0\.01ms !important;/);
});
