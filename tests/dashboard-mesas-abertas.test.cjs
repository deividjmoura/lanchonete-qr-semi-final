'use strict';

/**
 * Card “Mesas ocupadas” do dashboard → modal que cobre o painel com as
 * mesas abertas, no mesmo estilo do dashboard e com o detalhe de cada mesa.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativo) => fs.readFileSync(path.join(__dirname, '..', relativo), 'utf8');
const dashboard = read('src/screens/Dashboard.tsx');
const modal = read('src/screens/dashboard/MesasAbertasModal.tsx');
const css = read('src/screens/dashboard.css');

test('o card “Mesas ocupadas” abre o modal em vez do diálogo de detalhes', () => {
  assert.match(dashboard, /import \{ MesasAbertasModal \} from "\.\/dashboard\/MesasAbertasModal"/);
  assert.match(dashboard, /const \[mesasAbertas, setMesasAbertas\] = useState\(false\)/);
  assert.match(dashboard, /onClick=\{\(\) => \(card\.id === "mesas" \? setMesasAbertas\(true\) : setSelecionado\(card\.id\)\)\}/);
  assert.match(dashboard, /<MesasAbertasModal open=\{mesasAbertas\} onClose=\{\(\) => setMesasAbertas\(false\)\} \/>/);
});

test('o modal cobre o painel e usa o mesmo vocabulário visual do dashboard', () => {
  assert.match(modal, /className="dash-dialog dash-dialog--full"/);
  assert.match(modal, /ref=\{dialogo\}/);
  assert.match(modal, /el\.showModal\(\)/);
  // Fecha pelo backdrop, pelo botão e pelo ESC (onClose do próprio <dialog>).
  assert.match(modal, /event\.target === event\.currentTarget/);
  assert.match(modal, /onClose=\{onClose\}/);
  // Retrato vivo: recarrega enquanto está aberto, sem depender do SSE da página.
  assert.match(modal, /api\.adminMesasPanorama\("hoje"\)/);
  assert.match(modal, /setInterval/);

  assert.match(css, /\.dash-dialog--full\[open\] \{ display: flex; \}/);
  assert.match(css, /\.dash-dialog--full \{[^}]*width: min\(1360px, calc\(100vw - 24px\)\)/s);
  // Mesma folha e mesma tinta do painel (identidade "Passe"): nada de fundo próprio.
  assert.match(css, /\.dash-mesas \{[^}]*background: var\(--surface\);[^}]*color: var\(--text\)/s);
  assert.doesNotMatch(css, /var\(--stage-/, 'os tokens de "palco" saíram com a identidade anterior');
});

test('só entram no modal as mesas com sessão aberta, com quem pediu e quem leva', () => {
  assert.match(modal, /filter\(\(mesa\) => Boolean\(mesa\.sessaoId\)\)/);
  assert.match(modal, /Quem pediu/);
  assert.match(modal, /mesa\.clienteNome/);
  assert.match(modal, /Quem está levando/);
  assert.match(modal, /mesa\.garcomResponsavelNome/);
  // Tempo, produção e dinheiro aparecem no cartão antes de qualquer clique.
  assert.match(modal, /formatarDuracao/);
  assert.match(modal, /itensNaFila/);
  assert.match(modal, /BRL\(mesa\.saldo\)/);
  assert.match(modal, /Consumo em aberto/);
});

test('o detalhe da mesa é carregado sob demanda, sem bloquear a abertura', () => {
  assert.match(modal, /adminMesaDetalhe\(mesa\.numero\)/);
  assert.match(modal, /aria-expanded=\{aberto\}/);
  assert.match(modal, /pedido\.clienteNome/);
  assert.match(modal, /pedido\.garcomNome/);
  // Nada de alert nativo: falha aparece no próprio cartão.
  assert.doesNotMatch(modal, /\balert\(/);
  assert.match(modal, /dash-mesa__detalhe-erro/);
});

test('listas longas não derrubam o modal: paginação e filtros', () => {
  assert.match(modal, /useLimiteLocal\(visiveis, 12,/);
  assert.match(modal, /ControlesPaginacao/);
  assert.match(modal, /Buscar mesa, cliente ou garçom/);
  assert.match(modal, /Mais tempo aberta/);
  assert.match(modal, /Críticas/);
});

test('pagamentos parciais usam as formas normalizadas pelo mapper', () => {
  // formaFromApi devolve "credito"/"debito": chavear o rótulo por
  // "cartao_credito" mostrava o valor cru na tela.
  assert.match(modal, /credito: "Cartão de crédito"/);
  assert.match(modal, /debito: "Cartão de débito"/);
  assert.match(modal, /pix: "Pix"/);
  assert.match(modal, /dinheiro: "Dinheiro"/);
  assert.doesNotMatch(modal, /cartao_credito|cartao_debito/);
});
