const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveResetPassword } = require('../scripts/reset-senha');

test('prefers STAFF_SEED_PASSWORD when both environment variables are set', () => {
  assert.equal(resolveResetPassword({ STAFF_SEED_PASSWORD: 'strong-secret', ADMIN_PASSWORD: 'other-secret' }), 'strong-secret');
});

test('supports ADMIN_PASSWORD as an explicit fallback', () => {
  assert.equal(resolveResetPassword({ ADMIN_PASSWORD: 'another-strong-secret' }), 'another-strong-secret');
});

test('refuses to reset credentials without an explicit secret', () => {
  assert.throws(() => resolveResetPassword({}), /Defina STAFF_SEED_PASSWORD/);
});

test('refuses the known placeholder password', () => {
  assert.throws(() => resolveResetPassword({ STAFF_SEED_PASSWORD: 'troque-esta-senha' }), /senha forte/i);
});
