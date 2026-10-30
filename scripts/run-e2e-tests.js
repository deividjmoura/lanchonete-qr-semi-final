#!/usr/bin/env node
'use strict';

/**
 * Roda os E2E em Chromium real do PWA do garçom.
 *
 *   DATABASE_URL=postgres://.../qradmin_test npm run test:e2e
 *
 * O Chromium empacotado (@sparticuz) extrai bibliotecas compartilhadas que
 * precisam estar no LD_LIBRARY_PATH. Se a variável não vier definida, o runner
 * aponta o caminho padrão usado na extração, em vez de falhar com um erro
 * obscuro de dynamic linker.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
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

const env = { ...process.env, NODE_ENV: 'test' };
if (!env.LD_LIBRARY_PATH) {
  const candidatos = ['/tmp/al2023/lib', '/tmp/al2023/usr/lib'].filter((d) => fs.existsSync(d));
  if (candidatos.length) env.LD_LIBRARY_PATH = candidatos.join(':');
}

const testes = fs
  .readdirSync(path.join(__dirname, '..', 'tests', 'e2e'))
  .filter((f) => f.endsWith('.e2e.cjs'))
  .sort();

if (!testes.length) {
  console.error('Nenhum E2E encontrado em tests/e2e.');
  process.exit(1);
}

let falhas = 0;
for (const teste of testes) {
  console.log(`\n▶ ${teste}`);
  const r = spawnSync(process.execPath, [path.join('tests', 'e2e', teste)], { stdio: 'inherit', env });
  if (r.status !== 0) falhas++;
}

console.log(`\n${testes.length - falhas}/${testes.length} E2E passaram.`);
if (falhas) process.exit(1);
