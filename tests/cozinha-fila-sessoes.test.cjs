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

test('fila usa rolagem lateral com 2–3 linhas e barra discreta', () => {
  assert.match(css, /grid-auto-flow:\s*column/);
  assert.match(css, /grid-auto-columns:\s*288px/, 'cartão com largura própria: uma comanda não estica a tela');
  assert.match(css, /grid-template-rows:\s*repeat\(2, minmax\(0, auto\)\)/);
  assert.match(css, /@media \(min-width: 1280px\)[\s\S]*?grid-template-rows:\s*repeat\(3, minmax\(0, auto\)\)/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scroll-snap-type:\s*x proximity/);
  assert.match(fila, /className="fila-rolagem"/);
  assert.match(fila, /className="fila-trilho"/);
});

test('telas pequenas continuam legíveis (320/375) e o movimento respeita reduced motion', () => {
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /grid-auto-columns:\s*252px/);
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

test('identidade visual do dashboard nas telas ativas (vidro, acento, sombra)', () => {
  for (const classe of ['ops-stage', 'ops-sessao', 'ops-card', 'ops-pill']) {
    assert.ok(css.includes('.' + classe), `classe ${classe} definida`);
  }
  assert.match(css, /border-radius:\s*24px/);
  assert.match(css, /box-shadow:[^;]*inset 0 1px 0/);
  assert.match(css, /color-mix\(in srgb, var\(--ops-accent\)/);
  assert.match(fila, /import "\.\.\/screens\/operacional\.css"/);
  // Contraste: texto principal e muted claros sobre o vidro escuro.
  assert.match(css, /color:\s*#f3f5ff/);
  assert.match(css, /color:\s*#a9b6cf/);
});

test('linguagem visual do dashboard chega ao caixa e ao PWA sem perder contraste', () => {
  const index = read('src/index.css');
  const caixa = read('src/screens/Caixa.tsx');
  const pwa = read('public/garcom-pwa/styles.css');
  const sw = read('public/garcom-pwa/sw.js');

  assert.match(index, /\.ops-card-surface \{/);
  assert.match(index, /color-mix\(in srgb, var\(--surface-raised\) 93%, var\(--brand-surface\)\)/);
  assert.match(index, /var\(--shadow-card-hover/);
  assert.equal((caixa.match(/ops-card-surface/g) || []).length, 2, 'lista e comanda do caixa usam a superfície');

  assert.match(pwa, /backdrop-filter: blur\(14px\) saturate\(140%\)/);
  assert.match(pwa, /\.order \{[\s\S]*?var\(--shadow-card-hover\)/);
  assert.match(pwa, /scrollbar-width: thin/);
  assert.match(sw, /garcom-pwa-shell-v(3[3-9]|[4-9]\d)/, 'cache novo para os aparelhos pegarem o CSS');

  // Cartões de vidro do panorama/mapa recebem o movimento por cartão.
  assert.match(index, /\[data-glass-card\] \{/);
  assert.match(index, /article\[data-glass-card\] \{\s*animation: glass-card-in/);
  assert.match(index, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,120}article\[data-glass-card\]/);
  assert.match(read('src/screens/admin/PanoramaMesas.tsx'), /data-glass-card/);
});
