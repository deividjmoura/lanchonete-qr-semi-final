'use strict';

// Integração real (issue #41): dump -> restore em banco isolado -> verificação.
// Roda apenas no job "PostgreSQL integration" (banco descartável, sem secrets de produção).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const { main, parseDbUrl } = require('../scripts/backup-restore-drill');

function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

async function admin(url, fn) {
  const c = new Client({ connectionString: withDatabase(url, 'postgres') });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

test('PostgreSQL real: restore em banco isolado reproduz schema, linhas e sequences', async (t) => {
  const sourceUrl = process.env.DATABASE_URL;
  assert.ok(sourceUrl, 'DATABASE_URL do serviço descartável é obrigatório');
  assert.match(parseDbUrl(sourceUrl, 'DATABASE_URL').host, /^(127\.0\.0\.1|localhost|postgres)$/, 'só roda contra o container de CI');

  const restoreDb = `qradmin_restore_drill_${process.pid}`;
  const restoreUrl = withDatabase(sourceUrl, restoreDb);
  const reportPath = path.join(os.tmpdir(), `restore-report-${process.pid}.json`);

  const src = new Client({ connectionString: sourceUrl });
  await src.connect();
  const marker = `restore-drill-${process.pid}`;
  try {
    const cat = await src.query('INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id', [marker]);
    await src.query(
      `INSERT INTO produtos (categoria_id, nome, preco, disponivel) VALUES ($1, $2, 9.90, TRUE)`,
      [cat.rows[0].id, `${marker}-produto`]
    );
  } finally {
    await src.end();
  }

  await admin(sourceUrl, (c) => c.query(`CREATE DATABASE "${restoreDb}"`));
  t.after(async () => {
    fs.rmSync(reportPath, { force: true });
    await admin(sourceUrl, (c) => c.query(`DROP DATABASE IF EXISTS "${restoreDb}" WITH (FORCE)`));
  });

  const env = {
    ...process.env,
    SOURCE_DATABASE_URL: sourceUrl,
    RESTORE_DATABASE_URL: restoreUrl,
    RESTORE_DRILL_CONFIRM: 'isolated-target',
  };
  const code = await main(['--report', reportPath], env);
  assert.equal(code, 0);

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.resultado, 'OK');
  assert.deepEqual(report.verificacao.divergencias, []);
  assert.equal(report.verificacao.conexao_pool_da_aplicacao, true);
  assert.ok(report.verificacao.linhas_por_tabela.produtos >= 1);
  assert.ok(report.restauracao.duracao_ms >= 0 && report.rto_observado_ms >= report.restauracao.duracao_ms);
  assert.ok(!JSON.stringify(report).includes('postgres://'), 'relatório não pode conter URL/credencial');

  // O dado marcado precisa existir no banco restaurado.
  const dst = new Client({ connectionString: restoreUrl });
  await dst.connect();
  try {
    const r = await dst.query('SELECT count(*)::int AS n FROM produtos WHERE nome = $1', [`${marker}-produto`]);
    assert.equal(r.rows[0].n, 1);
    // Sequence restaurada: o próximo INSERT não pode colidir com ids existentes.
    const ins = await dst.query(
      `INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id`, [`${marker}-pos-restore`]
    );
    assert.ok(ins.rows[0].id > 0);
  } finally {
    await dst.end();
  }

  // Um segundo restore no mesmo destino (agora não vazio) tem de ser recusado sem alterar nada.
  await assert.rejects(() => main(['--report', reportPath], env), /não está vazio/);
});

test('PostgreSQL real: modo arquivo restaura dump existente e recusa destino igual à origem', async (t) => {
  const sourceUrl = process.env.DATABASE_URL;
  const dumpPath = path.join(os.tmpdir(), `backup-${process.pid}.dump`);
  const d = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', dumpPath, '--dbname', sourceUrl]);
  assert.equal(d.status, 0, 'pg_dump precisa estar disponível no runner');

  const restoreDb = `qradmin_restore_file_${process.pid}`;
  const restoreUrl = withDatabase(sourceUrl, restoreDb);
  await admin(sourceUrl, (c) => c.query(`CREATE DATABASE "${restoreDb}"`));
  t.after(async () => {
    fs.rmSync(dumpPath, { force: true });
    await admin(sourceUrl, (c) => c.query(`DROP DATABASE IF EXISTS "${restoreDb}" WITH (FORCE)`));
  });

  const env = { ...process.env, RESTORE_DATABASE_URL: restoreUrl, RESTORE_DRILL_CONFIRM: 'isolated-target' };
  delete env.SOURCE_DATABASE_URL;
  const reportPath = path.join(os.tmpdir(), `restore-file-${process.pid}.json`);
  const code = await main(['--dump-file', dumpPath, '--backup-at', new Date().toISOString(), '--report', reportPath], env);
  fs.rmSync(reportPath, { force: true });
  assert.equal(code, 0);

  // Nunca restaurar por cima do banco operacional (aqui, o banco de CI faz o papel dele).
  await assert.rejects(
    () => main(['--dump-file', dumpPath], { ...env, RESTORE_DATABASE_URL: sourceUrl }),
    /descartável|mesmo banco|não está vazio/
  );
});
