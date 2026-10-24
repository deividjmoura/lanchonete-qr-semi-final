const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startProduction } = require('../scripts/start-production');

function harness(result) {
  const events = [];
  const logger = {
    log: (...args) => events.push(['log', ...args]),
    error: (...args) => events.push(['error', ...args]),
  };
  let serverStarted = false;
  let spawnArgs;
  const spawn = (...args) => {
    spawnArgs = args;
    return result;
  };
  const loadServer = () => { serverStarted = true; };
  return {
    run: () => startProduction({ spawn, loadServer, logger, env: { NODE_ENV: 'test' } }),
    events,
    get serverStarted() { return serverStarted; },
    get spawnArgs() { return spawnArgs; },
  };
}

test('inicia servidor somente quando migrations terminam com exit 0', () => {
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  try {
    const h = harness({ status: 0, error: null });
    assert.equal(h.run(), true);
    assert.equal(h.serverStarted, true);
    assert.match(h.events[0][1], /Migrations verificadas/);
    assert.equal(h.spawnArgs[2].timeout, 30_000);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('não inicia servidor quando migration retorna exit diferente de zero', () => {
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  try {
    const h = harness({ status: 1, error: null });
    assert.equal(h.run(), false);
    assert.equal(h.serverStarted, false);
    assert.equal(process.exitCode, 1);
    assert.ok(h.events.some((e) => e[0] === 'error' && /NÃO iniciado/.test(e.join(' '))));
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('não inicia servidor se spawn falha ou timeout', () => {
  for (const error of [new Error('spawn failed'), Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })]) {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    try {
      const h = harness({ status: null, error });
      assert.equal(h.run(), false);
      assert.equal(h.serverStarted, false);
      assert.equal(process.exitCode, 1);
    } finally {
      process.exitCode = previousExitCode;
    }
  }
});
