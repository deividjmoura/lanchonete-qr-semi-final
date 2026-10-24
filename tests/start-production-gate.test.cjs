const test = require('node:test');
const assert = require('node:assert/strict');
const { migrationFailure } = require('../scripts/start-production');

test('permite iniciar apenas quando migrations terminam com exit 0', () => {
  assert.equal(migrationFailure({ status: 0, error: undefined, signal: null }), null);
});

test('bloqueia startup quando migrations retornam exit diferente de zero', () => {
  assert.match(migrationFailure({ status: 1, error: undefined, signal: null }), /não será iniciado/i);
});

test('bloqueia startup quando migrations excedem timeout ou falham ao spawn', () => {
  assert.match(migrationFailure({ status: null, error: Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' }), signal: 'SIGTERM' }), /não foi possível executar migrations/i);
});

test('bloqueia startup quando processo de migrations termina por sinal', () => {
  assert.match(migrationFailure({ status: null, error: undefined, signal: 'SIGKILL' }), /sinal SIGKILL/i);
});
