'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

// Callbacks reais do TSX com store/prompt isolados, sem banco ou navegador.
function montar(estoque, resposta) {
  const chamadas = [];
  const store = {
    setEstoque: (...args) => chamadas.push(['set', ...args]),
    ativarControleEstoque: (...args) => chamadas.push(['ativar', ...args]),
    reportarErro: (msg) => { if (msg !== null) chamadas.push(['erro', msg]); },
  };
  const exports = {};
  const src = fs.readFileSync(path.join(root, 'src/screens/admin/ControlesEstoque.tsx'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(js, {
    exports,
    require: (id) => id.includes('store/usePub') ? { usePub: (selector) => selector(store) } : require(id),
    window: { prompt: () => resposta },
  });
  const tree = exports.ControlesEstoque({ produto: { id: 7, nome: 'Suco', estoque } });
  const buttons = [];
  function walk(el) {
    if (!el || typeof el !== 'object') return;
    if (el.type === 'button') buttons.push(el);
    const children = el.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) walk(child);
  }
  walk(tree);
  return { buttons, chamadas, ...exports };
}

test('quantidades aceitam zero e inteiros, recusam frações, vazios e valores inválidos', () => {
  const { quantidadeEstoque: parse } = montar(1, null);
  for (const raw of ['', ' ', '-1', '1.2', '1,2', 'NaN', 'Infinity', '9007199254740992']) assert.equal(parse(raw), null, raw);
  assert.equal(parse('0'), 0);
  assert.equal(parse(' 12 '), 12);
});

test('entrada soma, definir substitui e retirada não cria saldo negativo', () => {
  const { buttons, chamadas } = montar(5, '3');
  buttons.forEach((b) => b.props.onClick());
  assert.deepEqual(chamadas, [['set', 7, 8], ['set', 7, 3], ['set', 7, 4]]);
  const zero = montar(0, '0');
  assert.equal(zero.buttons[2].props.disabled, true);
  zero.buttons[2].props.onClick();
  assert.deepEqual(zero.chamadas, [['set', 7, 0]]);
});

test('sem controle oferece ativação, inclusive com quantidade zero', () => {
  const { buttons, chamadas } = montar(null, '0');
  assert.equal(buttons.length, 1);
  buttons[0].props.onClick();
  assert.deepEqual(chamadas, [['ativar', 7, 0]]);
});

test('cancelamento não altera estoque; quantidade inválida reporta erro sem mutação', () => {
  for (const resposta of [null, '', '-2', '1.5']) {
    const { buttons, chamadas } = montar(5, resposta);
    buttons[0].props.onClick();
    assert.equal(chamadas.length, resposta === null ? 0 : 1);
    if (resposta !== null) assert.equal(chamadas[0][0], 'erro');
  }
  const limite = montar(Number.MAX_SAFE_INTEGER, '1');
  limite.buttons[0].props.onClick();
  assert.equal(limite.chamadas[0][0], 'erro');
});

test('alerta inclui esgotados e limite exato, mas ignora produtos sem controle ou acima do mínimo', () => {
  const { estoqueBaixo } = montar(null, null);
  assert.equal(estoqueBaixo({ estoque: null, estoqueMinimo: 10 }), false);
  assert.equal(estoqueBaixo({ estoque: 0 }), true);
  assert.equal(estoqueBaixo({ estoque: 3, estoqueMinimo: 3 }), true);
  assert.equal(estoqueBaixo({ estoque: 4, estoqueMinimo: 3 }), false);
});

test('cardápio incorpora controles e alerta sem mudar menu ou manter estoque em Funções', () => {
  const admin = fs.readFileSync(path.join(root, 'src/screens/Admin.tsx'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'src/components/OpsShell.tsx'), 'utf8');
  assert.match(admin, /titulo=\{aba === "cardapio" \? "Cardápio & Estoque" : abaAtual.label\}/);
  assert.match(admin, /<ControlesEstoque produto=\{p\} \/>/);
  assert.match(admin, /aria-label="Produtos com estoque baixo"/);
  assert.match(admin, /produtos.filter\(estoqueBaixo\)/);
  assert.match(shell, /id: "admin-cardapio", label: "Cardápio"/);
  assert.doesNotMatch(admin, /function Estoque\(|<Estoque \/>|id: "estoque"/);
  assert.match(admin, /useState<"relatorio" \| "historico" \| "senhas" \| "purge">\("relatorio"\)/);
});
