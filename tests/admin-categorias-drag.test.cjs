'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('categorias do cardápio são reordenáveis por arrastar e não exibem botões subir/descer', () => {
  const source = fs.readFileSync('src/screens/Admin.tsx', 'utf8');
  const start = source.indexOf('function Cardapio()');
  const end = source.indexOf('function ProdutoForm', start);
  const cardapio = source.slice(start, end);
  assert.match(cardapio, /draggable/);
  assert.match(cardapio, /onDragStart/);
  assert.match(cardapio, /onDragOver/);
  assert.match(cardapio, /onDrop/);
  assert.match(cardapio, /setCategoriasOrdem\(ids\)/);
  assert.match(cardapio, /Alt \+ ↑ ou Alt \+ ↓/);
  assert.doesNotMatch(cardapio, /title="Subir"|title="Descer"|<ArrowUp|<ArrowDown/);
});

test('ação em lote do PWA só aparece para mais de um item elegível', () => {
  const app = fs.readFileSync('public/garcom-pwa/app.js', 'utf8');
  assert.match(app, /if\(ids\.length<2\)continue;/);
  assert.match(app, /deliveryAction\(order\.id,etapa,ids\)/);
});
