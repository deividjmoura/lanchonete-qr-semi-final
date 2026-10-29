'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('legacy Caixa partial-payment UI persists and reuses an idempotency key', () => {
  const source = read('public/js/caixa-divisao.js');
  assert.match(source, /function getAttempt\(id, valor, formaPagamento\)/);
  assert.match(source, /localStorage\.setItem\(attemptStorageKey\(id\), JSON\.stringify\(attempt\)\)/);
  assert.match(source, /idempotencyKey: attempt\.idempotencyKey/);
  assert.match(source, /res\.status >= 400 && res\.status < 500/);
  assert.match(source, /Reenvie os mesmos dados para reutilizar a tentativa/);
  assert.match(source, /Há uma tentativa de pagamento pendente/);
});

test('React Caixa API requires an idempotency key and store retains uncertain attempts', () => {
  const api = read('src/lib/api.ts');
  const store = read('src/store/usePub.ts');
  assert.match(api, /registrarPagamento: \(sessaoId: number, valor: number, formaPagamento: string, idempotencyKey: string\)/);
  assert.match(api, /\{ valor, formaPagamento, idempotencyKey \}/);
  assert.match(store, /getPendingPaymentAttempt\(sessaoId, valor, formaToApi\(forma\)\)/);
  assert.match(store, /api\.registrarPagamento\(sessaoId, valor, formaToApi\(forma\), attempt\.idempotencyKey\)/);
  assert.match(store, /clearPendingPaymentAttempt\(sessaoId\)/);
  assert.match(store, /rede\/5xx pode ocorrer depois do commit/);
});
