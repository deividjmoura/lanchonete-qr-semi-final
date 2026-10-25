'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scriptPath = path.join(__dirname, '..', 'scripts', 'reset-senha.js');
const source = fs.readFileSync(scriptPath, 'utf8');

test('script não imprime senha nem constrói comando curl com segredo', () => {
  assert.doesNotMatch(source, /console\.log\([^\n]*senha/i);
  assert.doesNotMatch(source, /curl[^\n]*senha/i);
  assert.doesNotMatch(source, /troque-esta-senha/);
});

test('sem senha explícita, falha antes de carregar módulos de banco', () => {
  const r = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, STAFF_SEED_PASSWORD: '', ADMIN_PASSWORD: '' },
    timeout: 5000,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Defina STAFF_SEED_PASSWORD/);
  assert.doesNotMatch(r.stdout + r.stderr, /troque-esta-senha/);
});

test('senha curta é rejeitada antes de carregar módulos de banco', () => {
  const r = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, STAFF_SEED_PASSWORD: 'curta', ADMIN_PASSWORD: '' },
    timeout: 5000,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pelo menos 12 caracteres/);
  assert.doesNotMatch(r.stdout + r.stderr, /curta/);
});

test('senha fictícia nunca aparece na saída durante um reset stubado', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qradmin-reset-senha-'));
  const preloadPath = path.join(dir, 'stub-db.cjs');
  const secret = 'teste-ficticio-unico-7a91';

  fs.writeFileSync(preloadPath, String.raw\`
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (parent && parent.filename === process.env.RESET_SCRIPT_PATH && request === '../db/auth') {
        return {
          hashSenha: async () => 'hash-ficticio',
          garantirStaffSeed: async () => ({ created: false }),
        };
      }
      if (parent && parent.filename === process.env.RESET_SCRIPT_PATH && request === '../db/pool') {
        return {
          query: async () => ({ rows: [{ login: 'admin', papel: 'admin', ativo: true }] }),
          end: async () => {},
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
  \`);

  try {
    const nodeOptions = [process.env.NODE_OPTIONS, \`--require=\${preloadPath}\`].filter(Boolean).join(' ');
    const r = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
        RESET_SCRIPT_PATH: scriptPath,
        STAFF_SEED_PASSWORD: secret,
        ADMIN_PASSWORD: '',
      },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Senha atualizada com sucesso/);
    assert.match(r.stdout, /admin/);
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(secret));
    assert.doesNotMatch(r.stdout + r.stderr, /curl/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
