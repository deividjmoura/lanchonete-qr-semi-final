#!/usr/bin/env node
/**
 * Executa a suite de regressao sem lista manual no package.json.
 * Descobre tests/regressions.cjs + tests/*.test.cjs, exceto testes que exigem
 * PostgreSQL real (tests/postgres-*.test.cjs), que rodam no workflow
 * "PostgreSQL integration" contra um banco descartavel.
 * Funciona em Node 20+ (nao depende de glob do `node --test`).
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = path.join(__dirname, '..', 'tests');
const arquivos = fs
  .readdirSync(dir)
  .filter((f) => f === 'regressions.cjs' || (f.endsWith('.test.cjs') && !f.startsWith('postgres-')))
  .sort()
  .map((f) => path.join('tests', f));

if (!arquivos.length) {
  console.error('Nenhum teste encontrado em tests/.');
  process.exit(1);
}
const r = spawnSync(process.execPath, ['--test', ...arquivos], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
process.exit(r.status === null ? 1 : r.status);
