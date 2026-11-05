#!/usr/bin/env node
/**
 * PostgreSQL descartável para rodar `npm run test:pg` fora do CI.
 *
 * Os testes `tests/postgres-*.test.cjs` exigem um banco chamado `qradmin_test`
 * (o guard dos próprios testes recusa qualquer outro nome). No CI isso vem do
 * serviço `postgres:16`; localmente este script sobe um PostgreSQL embarcado em
 * `.tmp-pgdata/` (ignorado pelo git) e imprime o `DATABASE_URL` a usar.
 *
 *   npm run pg:local          # sobe e fica em primeiro plano (Ctrl+C encerra)
 *
 *   # em outro terminal:
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/qradmin_test npm run db:migrate
 *   DATABASE_URL=... npm run test:pg
 *
 * A porta pode ser trocada com PG_LOCAL_PORT; o diretório, com PG_LOCAL_DIR.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const dir = path.resolve(process.env.PG_LOCAL_DIR || '.tmp-pgdata');
const port = Number(process.env.PG_LOCAL_PORT || 55433);
const database = 'qradmin_test';
const url = `postgres://postgres:postgres@127.0.0.1:${port}/${database}`;

mkdirSync(dir, { recursive: true });

const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: true });

await pg.initialise();
await pg.start();
try {
  await pg.createDatabase(database);
} catch (erro) {
  // Banco já existente entre execuções é o caso normal quando o diretório é reaproveitado.
  if (!/already exists/i.test(String(erro && erro.message))) throw erro;
}

console.log(`PostgreSQL local pronto em ${dir} (porta ${port}).`);
console.log(`DATABASE_URL=${url}`);
console.log('Ctrl+C encerra o processo (o diretório permanece para a próxima execução).');

let encerrando = false;
const encerrar = async (sinal) => {
  if (encerrando) return;
  encerrando = true;
  try {
    await pg.stop();
  } finally {
    console.log(`\nPostgreSQL encerrado (${sinal}).`);
    process.exit(0);
  }
};
process.on('SIGINT', () => void encerrar('SIGINT'));
process.on('SIGTERM', () => void encerrar('SIGTERM'));
setInterval(() => {}, 1 << 30);
