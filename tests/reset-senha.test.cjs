const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolvePassword, main } = require('../scripts/reset-senha');

test('exige senha explícita e não usa fallback previsível', () => {
  assert.throws(() => resolvePassword({}), /Defina STAFF_SEED_PASSWORD ou ADMIN_PASSWORD/);
  assert.throws(() => resolvePassword({ STAFF_SEED_PASSWORD: '   ' }), /Defina STAFF_SEED_PASSWORD ou ADMIN_PASSWORD/);
  assert.equal(resolvePassword({ STAFF_SEED_PASSWORD: 'fake-secret-1' }), 'fake-secret-1');
  assert.equal(resolvePassword({ ADMIN_PASSWORD: 'fake-secret-2' }), 'fake-secret-2');
});

test('sem senha explícita falha antes de carregar ou consultar o banco', async () => {
  const oldExitCode = process.exitCode;
  process.exitCode = 0;
  const events = [];
  try {
    const ok = await main({
      env: {},
      logger: { log: (...x) => events.push(x), error: (...x) => events.push(x) },
    });
    assert.equal(ok, false);
    assert.equal(process.exitCode, 1);
    assert.match(events.flat().join(' '), /Defina STAFF_SEED_PASSWORD ou ADMIN_PASSWORD/);
  } finally {
    process.exitCode = oldExitCode;
  }
});

test('stdout e stderr não contêm senha nem comando curl', async () => {
  const secret = 'unique-fake-secret-DO-NOT-LOG';
  const events = [];
  const logger = {
    log: (...args) => events.push(args.join(' ')),
    error: (...args) => events.push(args.join(' ')),
  };
  let queryArgs;
  const pool = {
    async query(sql, args) {
      queryArgs = { sql, args };
      return { rows: [
        { login: 'admin', papel: 'admin', ativo: true },
        { login: 'cozinha', papel: 'cozinha', ativo: true },
        { login: 'caixa', papel: 'caixa', ativo: true },
      ] };
    },
    async end() {},
  };
  const auth = {
    async garantirStaffSeed() { return { created: false }; },
    async hashSenha(value) { assert.equal(value, secret); return 'fake-hash'; },
  };
  const oldExitCode = process.exitCode;
  process.exitCode = 0;
  try {
    assert.equal(await main({ env: { STAFF_SEED_PASSWORD: secret }, logger, pool, auth }), true);
    assert.deepEqual(queryArgs.args, ['fake-hash']);
    assert.equal(events.join('\n').includes(secret), false);
    assert.equal(events.join('\n').toLowerCase().includes('curl'), false);
    assert.match(events.join('\n'), /admin/);
  } finally {
    process.exitCode = oldExitCode;
  }
});
