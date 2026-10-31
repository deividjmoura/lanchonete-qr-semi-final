#!/usr/bin/env node
'use strict';

/**
 * Roda as suítes que exigem PostgreSQL real.
 *
 * Elas ficam fora do `npm test` de propósito: precisam de banco descartável.
 * Este runner existe para que o comando seja documentável e não uma sequência
 * de invocações soltas que ninguém lembra de rodar.
 *
 *   DATABASE_URL=postgres://.../qradmin_test npm run test:pg
 *
 * Segurança: recusa qualquer banco que não seja de teste, para nunca escrever
 * em produção por engano.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL apontando para um banco descartável de teste.');
  process.exit(1);
}
let nome;
try {
  nome = new URL(url).pathname.replace(/^\//, '');
} catch {
  console.error('DATABASE_URL inválida.');
  process.exit(1);
}
if (!/(^|_)test($|_)/.test(nome)) {
  console.error(`Recusando executar contra o banco "${nome}". O nome precisa conter "test".`);
  process.exit(1);
}

const suites = [
  'postgres-integration.test.cjs',
  'postgres-financial-integration.test.cjs',
  'postgres-dashboard.test.cjs',
  'postgres-waiter-integration.test.cjs',
  'postgres-remocao-garcom.test.cjs',
  'postgres-paginacao.test.cjs',
  'postgres-entregas-progressivas.test.cjs',
  'postgres-qr-session.test.cjs',
  'postgres-financial-concurrency.test.cjs',
  'postgres-password-change.test.cjs',
];

// O drill de backup precisa de pg_dump/psql no PATH. Em ambiente local com
// embedded-postgres esses binários não existem; no CI (postgres:16) existem.
if (!process.argv.includes('--sem-backup')) suites.push('postgres-backup-restore.test.cjs');

let falhas = 0;
for (const suite of suites) {
  console.log(`\n▶ ${suite}`);
  const r = spawnSync(process.execPath, ['--test', path.join('tests', suite)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  if (r.status !== 0) falhas++;
}

console.log(`\n${suites.length - falhas}/${suites.length} suítes PostgreSQL passaram.`);
if (falhas) {
  console.error('Dica: sem pg_dump/psql locais, use --sem-backup (o drill roda no CI).');
  process.exit(1);
}
