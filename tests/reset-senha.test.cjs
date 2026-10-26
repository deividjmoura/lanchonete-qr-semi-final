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
  assert.doesNotMatch(source, /console\.log\(['"]Senha atualizada para:/i);
  assert.doesNotMatch(source, /JSON\.stringify\(senha\)/i);
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

test('senha fictícia nunca aparece na saída durante um reset stubado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qradmin-reset-senha-'));
  const preloadPath = path.join(dir, 'stub-db.cjs');
  const secret = 'teste-ficticio-unico-7a91';
  const preloadSource = [
    "const Module = require('node:module');",
    'const originalLoad = Module._load;',
    'Module._load = function(request, parent, isMain) {',
    "  if (parent && parent.filename === process.env.RESET_SCRIPT_PATH && request === '../db/auth') {",
    "    return { hashSenha: async () => 'hash-ficticio', garantirStaffSeed: async () => ({ created: false }) };",
    '  }',
    "  if (parent && parent.filename === process.env.RESET_SCRIPT_PATH && request === '../db/pool') {",
    "    return { query: async () => ({ rows: [{ login: 'admin', papel: 'admin', ativo: true }] }), end: async () => {} };",
    '  }',
    '  return originalLoad.call(this, request, parent, isMain);',
    '};',
  ].join('\n');
  fs.writeFileSync(preloadPath, preloadSource);

  try {
    const nodeOptions = [process.env.NODE_OPTIONS, '--require=' + preloadPath].filter(Boolean).join(' ');
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

// --- reset de um único login ---------------------------------------------

const { lerLogin } = require('../scripts/reset-senha.js');

function rodarComStub({ args = [], rows, secret = 'teste-ficticio-unico-7a91' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qradmin-reset-login-'));
  const preloadPath = path.join(dir, 'stub-db.cjs');
  const logPath = path.join(dir, 'queries.json');
  const preloadSource = [
    "const Module = require('node:module');",
    "const fs = require('node:fs');",
    'const originalLoad = Module._load;',
    'Module._load = function(request, parent, isMain) {',
    "  if (parent && parent.filename === process.env.RESET_SCRIPT_PATH && request === '../db/auth') {",
    "    return { hashSenha: async () => 'hash-ficticio', garantirStaffSeed: async () => ({ created: false }) };",
    '  }',
    "  if (parent && parent.filename === process.env.RESET_SCRIPT_PATH && request === '../db/pool') {",
    '    return {',
    '      query: async (sql, params) => {',
    "        fs.writeFileSync(process.env.RESET_LOG_PATH, JSON.stringify({ sql, params }));",
    "        return { rows: JSON.parse(process.env.RESET_ROWS) };",
    '      },',
    '      end: async () => {},',
    '    };',
    '  }',
    '  return originalLoad.call(this, request, parent, isMain);',
    '};',
  ].join('\n');
  fs.writeFileSync(preloadPath, preloadSource);
  try {
    const nodeOptions = [process.env.NODE_OPTIONS, '--require=' + preloadPath].filter(Boolean).join(' ');
    const r = spawnSync(process.execPath, [scriptPath, ...args], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
        RESET_SCRIPT_PATH: scriptPath,
        RESET_LOG_PATH: logPath,
        RESET_ROWS: JSON.stringify(rows),
        STAFF_SEED_PASSWORD: secret,
        ADMIN_PASSWORD: '',
      },
    });
    const query = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : null;
    return { r, query, secret };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('lerLogin aceita --login=x e --login x, normaliza para minúsculas', () => {
  assert.deepEqual(lerLogin(['node', 's', '--login=Caixa']), { login: 'caixa' });
  assert.deepEqual(lerLogin(['node', 's', '--login', 'BAR']), { login: 'bar' });
  assert.deepEqual(lerLogin(['node', 's']), { login: null });
});

test('lerLogin rejeita valor vazio, ausente ou com caracteres perigosos', () => {
  for (const args of [['--login='], ['--login'], ["--login=x'; DROP TABLE staff;--"], ['--login=a b'], ['--login=' + 'a'.repeat(65)]]) {
    assert.ok(lerLogin(['node', 's', ...args]).erro, args.join(' '));
  }
});

test('sem --login, mantém o reset dos 4 logins legados', () => {
  const { r, query } = rodarComStub({
    rows: [{ login: 'admin', papel: 'admin', ativo: true }],
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(query.sql, /IN \('admin', 'cozinha', 'bar', 'caixa'\)/);
  assert.deepEqual(query.params, ['hash-ficticio']);
  assert.match(r.stdout, /logins legados/);
});

test('--login altera somente o login informado, com parâmetro e sem interpolar no SQL', () => {
  const { r, query, secret } = rodarComStub({
    args: ['--login=Caixa'],
    rows: [{ login: 'caixa', papel: 'caixa', ativo: true }],
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(query.sql, /lower\(login\) = \$2/);
  assert.doesNotMatch(query.sql, /IN \(/);
  assert.doesNotMatch(query.sql, /caixa/i);
  assert.deepEqual(query.params, ['hash-ficticio', 'caixa']);
  assert.match(r.stdout, /login informado/);
  assert.match(r.stdout, /caixa/);
  assert.doesNotMatch(r.stdout + r.stderr, new RegExp(secret));
});

test('--login inexistente falha com código 1 e mensagem clara', () => {
  const { r } = rodarComStub({ args: ['--login=fantasma'], rows: [] });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Login "fantasma" não encontrado/);
});

test('--login inválido falha antes de carregar o banco', () => {
  const r = spawnSync(process.execPath, [scriptPath, '--login=a b'], {
    encoding: 'utf8',
    env: { ...process.env, STAFF_SEED_PASSWORD: 'senha-fictícia-longa-123', ADMIN_PASSWORD: '' },
    timeout: 5000,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Login inválido/);
  assert.doesNotMatch(r.stdout + r.stderr, /senha-fictícia-longa-123/);
});
