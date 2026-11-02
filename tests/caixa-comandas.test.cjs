// Coluna “Comandas abertas” do caixa: rola por dentro e para na altura do
// cartão de pagamento ao lado, em vez de empurrar a página inteira.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const tela = fs.readFileSync('src/screens/Caixa.tsx', 'utf8');
const css = fs.readFileSync('src/screens/operacional.css', 'utf8');

function blocoMedia(fonte) {
  const inicio = fonte.indexOf('@media (min-width: 1024px) {');
  assert.ok(inicio > 0, 'precisa existir o bloco @media (min-width: 1024px)');
  let profundidade = 0;
  let i = fonte.indexOf('{', inicio);
  const abre = i;
  for (; i < fonte.length; i++) {
    if (fonte[i] === '{') profundidade += 1;
    else if (fonte[i] === '}') {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(inicio, i + 1);
    }
  }
  throw new Error('bloco @media sem fechamento');
}

const desktop = blocoMedia(css);

test('a lista de comandas abertas rola dentro da própria coluna', () => {
  assert.match(tela, /className="lg:col-span-5 xl:col-span-4 caixa-comandas"/);
  assert.match(tela, /className="caixa-comandas__rolagem"/);
  assert.match(desktop, /\.caixa-comandas__rolagem \{[\s\S]*?overflow-y: auto/);
  assert.match(desktop, /\.caixa-comandas__rolagem \{[\s\S]*?min-height: 0/, 'senão o flex item não encolhe e não rola');
  assert.match(desktop, /\.caixa-comandas__rolagem \{[\s\S]*?flex: 1 1 auto/);
});

test('a altura da coluna acompanha o cartão de pagamento ao lado', () => {
  // height: 0 tira a lista do cálculo da linha do grid (quem manda é o cartão
  // da comanda); min-height: max(100%, 24rem) devolve a altura da linha e
  // ainda garante um piso quando o cartão do lado está baixo.
  assert.match(desktop, /\.caixa-comandas \{[\s\S]*?height: 0;/);
  assert.match(desktop, /\.caixa-comandas \{[\s\S]*?min-height: max\(100%, 24rem\)/);
  assert.match(desktop, /\.caixa-comandas \{[\s\S]*?display: flex/);
  assert.match(desktop, /\.caixa-comandas \{[\s\S]*?flex-direction: column/);
});

test('no celular a coluna empilha sem scroll preso', () => {
  const regras = css.slice(0, css.indexOf('@media (min-width: 1024px) {'));
  assert.doesNotMatch(regras, /\.caixa-comandas/, 'a rolagem é só a partir de 1024px');
  assert.match(css, /@media \(min-width: 1024px\)/);
});

test('a lista não pagina mais: todas as comandas ficam na rolagem', () => {
  assert.doesNotMatch(tela, /abertasVisiveis/, 'a paginação da lista saiu junto com o scroll interno');
  assert.match(tela, /\{abertas\.map\(\(s\) => \{/);
});

test('a camada operacional continua sem cor literal', () => {
  assert.doesNotMatch(desktop, /#[0-9a-fA-F]{3,8}\b/, 'use var(--stage-*)');
  assert.doesNotMatch(desktop, /rgba?\(/);
});
