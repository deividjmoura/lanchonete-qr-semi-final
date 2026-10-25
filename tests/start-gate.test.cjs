const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

test('npm start passa pelo gate de migrations (fail closed)', () => {
  assert.equal(pkg.scripts.start, 'node scripts/start-production.js');
  assert.equal(pkg.scripts['start:prod'], 'node scripts/start-production.js');
});

test('scripts de desenvolvimento continuam subindo o servidor direto', () => {
  assert.equal(pkg.scripts['dev:api'], 'node server.js');
  assert.equal(pkg.scripts.server, 'node server.js');
});
