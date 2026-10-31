'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { limitePagina, validarPeriodo, criarCursor, lerCursor } = require('../db/paginacao');

test('cursores preservam microssegundos, desempate e escopo dos filtros', () => {
  const filtros = ['2041-03-05', '2041-03-05', false];
  const cursor = criarCursor('pedidos', '2041-03-05T12:00:00.123456Z', 25, filtros);
  assert.deepEqual(lerCursor(cursor, 'pedidos', filtros), {
    v: 1, tipo: 'pedidos', data: '2041-03-05T12:00:00.123456Z', id: 25, filtros,
  });
  assert.throws(() => lerCursor(cursor, 'pedidos', ['2041-03-04', '2041-03-05', false]), (e) => e.status === 400);
  assert.throws(() => lerCursor(cursor, 'comprovantes'), (e) => e.status === 400);
  const semData = criarCursor('comprovantes', null, 5);
  assert.equal(lerCursor(semData, 'comprovantes', [], { permiteDataNula: true }).data, null);
  assert.throws(() => lerCursor(semData, 'comprovantes'), (e) => e.status === 400);
});

test('parâmetros inválidos retornam erro de cliente, não permitem limites excessivos', () => {
  for (const limite of ['', '0', '-1', '1.5', '1e2', '51', '99999999999999999']) {
    assert.throws(() => limitePagina(limite), (e) => e.status === 400);
  }
  for (const raw of ['', '!inválido', 'a'.repeat(513)]) {
    assert.throws(() => lerCursor(raw, 'pedidos'), (e) => e.status === 400);
  }
  assert.throws(() => validarPeriodo('2041-02-29', '2041-03-01'), (e) => e.status === 400);
  assert.throws(() => validarPeriodo('2041-04-02', '2041-04-01'), (e) => e.status === 400);
  assert.deepEqual(validarPeriodo('2040-02-29', null), { from: '2040-02-29', to: null });
  assert.equal(limitePagina(null), 10);
});
