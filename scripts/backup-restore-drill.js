#!/usr/bin/env node
'use strict';

/**
 * Exercício de backup e restauração do PostgreSQL (issue #41).
 *
 * O que faz:
 *   1. (modo "snapshot") gera um dump do banco de ORIGEM com pg_dump (somente leitura); ou
 *   2. (modo "arquivo")  usa um dump já existente (ex.: backup baixado do provedor);
 *   3. restaura em um banco de DESTINO isolado e vazio;
 *   4. verifica schema, migrations, contagem de linhas, sequences e conexão pela
 *      configuração real de pool da aplicação;
 *   5. mede duração do dump/restauração (insumo de RTO) e a idade do último dado
 *      restaurado (insumo de RPO) e emite um relatório JSON SEM credenciais.
 *
 * Segurança (por construção):
 *   - exige RESTORE_DRILL_CONFIRM=isolated-target;
 *   - recusa destino igual à origem (mesmo host/porta/banco);
 *   - recusa destino cujo nome de banco não indique ambiente descartável;
 *   - recusa destino que já contenha tabelas (nunca sobrescreve);
 *   - a origem só é lida (pg_dump + SELECTs em transação READ ONLY);
 *   - URLs e senhas nunca são impressas.
 *
 * Uso:
 *   SOURCE_DATABASE_URL=...  RESTORE_DATABASE_URL=...  RESTORE_DRILL_CONFIRM=isolated-target \
 *     node scripts/backup-restore-drill.js [--report evidencias/restore.json] [--tolerate-live-drift]
 *
 *   RESTORE_DATABASE_URL=...  RESTORE_DRILL_CONFIRM=isolated-target \
 *     node scripts/backup-restore-drill.js --dump-file backup.dump [--backup-at 2026-10-25T03:00:00Z]
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const CONFIRM_VALUE = 'isolated-target';
const SAFE_DB_NAME = /(?:^|[_-])(restore|drill|test|tmp|scratch|sandbox)(?:$|[_-])/i;
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

class DrillError extends Error {}

function parseDbUrl(raw, label) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    throw new DrillError(`${label}: URL inválida ou ausente.`);
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) {
    throw new DrillError(`${label}: esquema deve ser postgres:// ou postgresql://.`);
  }
  const database = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!database) throw new DrillError(`${label}: nome do banco ausente na URL.`);
  return {
    host: u.hostname.toLowerCase(),
    port: u.port || '5432',
    database,
  };
}

function sameDatabase(a, b) {
  return a.host === b.host && a.port === b.port && a.database === b.database;
}

/**
 * Remove a senha da URI passada como argumento de processo. O pg_* recebe a URI
 * sem senha e a credencial vai por PGPASSWORD, evitando exposição em ps/proc argv.
 */
function connectionForCli(raw, label) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    throw new DrillError(`${label}: URL inválida ou ausente.`);
  }
  let password = '';
  try {
    password = u.password ? decodeURIComponent(u.password) : '';
  } catch {
    throw new DrillError(`${label}: senha da URL tem encoding inválido.`);
  }
  const queryPassword = u.searchParams.get('password');
  if (!password && queryPassword) password = queryPassword;
  u.password = '';
  u.searchParams.delete('password');
  return {
    connectionString: u.toString(),
    env: { PGPASSWORD: password },
  };
}

/** Valida alvo/origem antes de qualquer comando. Lança DrillError se inseguro. */
function assertSafeTarget({ source, target, confirm }) {
  if (confirm !== CONFIRM_VALUE) {
    throw new DrillError(`Defina RESTORE_DRILL_CONFIRM=${CONFIRM_VALUE} para confirmar que o destino é isolado.`);
  }
  if (source && sameDatabase(source, target)) {
    throw new DrillError('Destino é o mesmo banco da origem. Recusado: nunca restaurar por cima do banco operacional.');
  }
  if (!SAFE_DB_NAME.test(target.database)) {
    throw new DrillError(
      'Nome do banco de destino não indica ambiente descartável (precisa conter restore, drill, test, tmp, scratch ou sandbox).'
    );
  }
}

function parseArgs(argv) {
  const out = { report: null, dumpFile: null, backupAt: null, tolerateLiveDrift: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--report') out.report = argv[++i];
    else if (a === '--dump-file') out.dumpFile = argv[++i];
    else if (a === '--backup-at') out.backupAt = argv[++i];
    else if (a === '--tolerate-live-drift') out.tolerateLiveDrift = true;
    else throw new DrillError(`Argumento desconhecido: ${a}`);
  }
  if (out.backupAt && Number.isNaN(Date.parse(out.backupAt))) {
    throw new DrillError('--backup-at precisa ser uma data ISO válida.');
  }
  return out;
}

function ms(start) {
  return Math.round(performance.now() - start);
}

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env } });
  if (r.error) throw new DrillError(`${cmd} não pôde ser executado: ${r.error.code || r.error.message}`);
  if (r.status !== 0) {
    // stderr do pg_* não contém a senha; ainda assim, removemos qualquer URL por garantia.
    const detail = String(r.stderr || '').replace(/postgres(ql)?:\/\/\S+/gi, '[url-omitida]').trim().slice(0, 600);
    throw new DrillError(`${cmd} falhou (exit ${r.status}): ${detail}`);
  }
  return r.stdout;
}

function toolVersion(cmd) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout).trim() : 'indisponível';
}

async function snapshot(client, { readOnly }) {
  if (readOnly) await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const version = (await client.query('SHOW server_version')).rows[0].server_version;
  const tables = (
    await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
    )
  ).rows.map((r) => r.table_name);
  const counts = {};
  for (const t of tables) {
    // Nome vem do catálogo do próprio banco; ainda assim é citado como identificador.
    counts[t] = Number((await client.query(`SELECT count(*) AS n FROM "${t.replace(/"/g, '""')}"`)).rows[0].n);
  }
  const migrations = tables.includes('schema_migrations')
    ? (await client.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map((r) => r.filename)
    : [];
  const constraints = Number(
    (await client.query(`SELECT count(*) AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'`)).rows[0].n
  );
  const indexes = Number((await client.query(`SELECT count(*) AS n FROM pg_indexes WHERE schemaname = 'public'`)).rows[0].n);
  const owned = (
    await client.query(
      `SELECT s.relname AS seq, t.relname AS tbl, a.attname AS col
         FROM pg_class s
         JOIN pg_namespace ns ON ns.oid = s.relnamespace AND ns.nspname = 'public'
         JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a', 'i')
         JOIN pg_class t ON t.oid = d.refobjid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
        WHERE s.relkind = 'S' ORDER BY s.relname`
    )
  ).rows;
  const lastValues = (
    await client.query(`SELECT sequencename, last_value FROM pg_sequences WHERE schemaname = 'public'`)
  ).rows.reduce((acc, r) => ({ ...acc, [r.sequencename]: r.last_value === null ? 0 : Number(r.last_value) }), {});
  const sequences = {};
  const sequenceLags = [];
  for (const o of owned) {
    const q = (id) => `"${String(id).replace(/"/g, '""')}"`;
    const max = Number((await client.query(`SELECT COALESCE(max(${q(o.col)}), 0)::bigint AS m FROM ${q(o.tbl)}`)).rows[0].m);
    sequences[o.seq] = lastValues[o.seq] ?? 0;
    // Sequence atrás do MAX(id) causaria colisão de chave no primeiro INSERT após o restore.
    if (sequences[o.seq] < max) sequenceLags.push(`${o.seq}=${sequences[o.seq]} < max(${o.tbl}.${o.col})=${max}`);
  }
  let lastOrderAt = null;
  if (tables.includes('pedidos')) {
    const r = await client.query('SELECT max(criado_em) AS ultimo FROM pedidos');
    lastOrderAt = r.rows[0].ultimo ? new Date(r.rows[0].ultimo).toISOString() : null;
  }
  if (readOnly) await client.query('ROLLBACK');
  return { version, tables, counts, migrations, constraints, indexes, sequences, sequenceLags, lastOrderAt };
}

/** Compara estado da origem com o restaurado. Retorna lista de divergências. */
function compareSnapshots(src, dst, { tolerateLiveDrift = false } = {}) {
  const problems = [];
  const missing = src.tables.filter((t) => !dst.tables.includes(t));
  const extra = dst.tables.filter((t) => !src.tables.includes(t));
  if (missing.length) problems.push(`tabelas ausentes no restore: ${missing.join(', ')}`);
  if (extra.length) problems.push(`tabelas extras no restore: ${extra.join(', ')}`);
  for (const t of src.tables) {
    if (!(t in dst.counts)) continue;
    const a = src.counts[t];
    const b = dst.counts[t];
    const drift = tolerateLiveDrift ? b > a : a !== b; // origem viva só pode ter CRESCIDO após o dump
    if (drift) problems.push(`contagem divergente em ${t}: origem=${a} restore=${b}`);
  }
  if (!tolerateLiveDrift) {
    if (JSON.stringify(src.migrations) !== JSON.stringify(dst.migrations)) {
      problems.push('schema_migrations difere entre origem e restore');
    }
  } else {
    const prefixOk = dst.migrations.every((m) => src.migrations.includes(m));
    if (!prefixOk) problems.push('restore contém migrations que a origem não tem');
  }
  if (!tolerateLiveDrift) {
    for (const [name, v] of Object.entries(src.sequences)) {
      if (dst.sequences[name] !== v) problems.push(`sequence ${name}: origem=${v} restore=${dst.sequences[name]}`);
    }
  }
  if (src.constraints !== dst.constraints) problems.push(`constraints: origem=${src.constraints} restore=${dst.constraints}`);
  if (src.indexes !== dst.indexes) problems.push(`índices: origem=${src.indexes} restore=${dst.indexes}`);
  return problems;
}

/** Sem origem (backup do provedor): confere o restore contra as migrations do repositório. */
function checkAgainstRepoMigrations(dst) {
  const repo = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const problems = [];
  const unknown = dst.migrations.filter((m) => !repo.includes(m));
  if (unknown.length) problems.push(`restore tem migrations desconhecidas ao repositório: ${unknown.join(', ')}`);
  const behind = repo.filter((m) => !dst.migrations.includes(m));
  return { problems, pendingMigrations: behind };
}

function checkSequences(dst) {
  return dst.sequenceLags.map((l) => `sequence atrás do maior id restaurado: ${l}`);
}

function appPoolCheck(targetUrl) {
  // Prova que a configuração real de pool da aplicação conecta e lê o banco restaurado.
  const code = `
    const pool = require('./db/pool');
    (async () => {
      const r = await pool.query("SELECT count(*)::int AS n FROM schema_migrations");
      console.log(JSON.stringify({ ok: true, migrations: r.rows[0].n }));
      await pool.end();
    })().catch((e) => { console.error(e.code || e.message); process.exit(1); });
  `;
  const out = run(process.execPath, ['-e', code], {
    DATABASE_URL: targetUrl,
    NODE_ENV: 'test',
  });
  return JSON.parse(out.trim().split('\n').pop());
}

async function ensureTargetEmpty(client) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`
  );
  if (rows[0].n > 0) {
    throw new DrillError('Banco de destino não está vazio. Recusado: o exercício nunca sobrescreve dados existentes.');
  }
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const { Client } = require('pg');
  const targetUrl = env.RESTORE_DATABASE_URL;
  const sourceUrl = args.dumpFile ? null : env.SOURCE_DATABASE_URL;

  const target = parseDbUrl(targetUrl, 'RESTORE_DATABASE_URL');
  const source = sourceUrl ? parseDbUrl(sourceUrl, 'SOURCE_DATABASE_URL') : null;
  if (!args.dumpFile && !source) {
    throw new DrillError('Informe SOURCE_DATABASE_URL (modo snapshot) ou --dump-file (modo arquivo).');
  }
  assertSafeTarget({ source, target, confirm: env.RESTORE_DRILL_CONFIRM });
  if (args.dumpFile && !fs.existsSync(args.dumpFile)) throw new DrillError('Arquivo de dump não encontrado.');

  const report = {
    modo: args.dumpFile ? 'arquivo-dump' : 'snapshot-pg_dump',
    iniciado_em: new Date().toISOString(),
    ferramentas: { pg_dump: toolVersion('pg_dump'), pg_restore: toolVersion('pg_restore') },
    destino: { host: target.host, banco: target.database },
    origem: source ? { host: source.host, banco: source.database } : null,
  };

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-restore-drill-'));
  const dumpPath = args.dumpFile || path.join(workDir, 'backup.dump');
  let srcState = null;

  try {
    const dstClient = new Client({ connectionString: targetUrl });
    await dstClient.connect();
    try {
      await ensureTargetEmpty(dstClient);
    } finally {
      await dstClient.end();
    }

    if (!args.dumpFile) {
      const t0 = performance.now();
      const srcClient = new Client({ connectionString: sourceUrl });
      await srcClient.connect();
      try {
        srcState = await snapshot(srcClient, { readOnly: true });
      } finally {
        await srcClient.end();
      }
      const sourceCli = connectionForCli(sourceUrl, 'SOURCE_DATABASE_URL');
      run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', dumpPath, '--dbname', sourceCli.connectionString], sourceCli.env);
      report.dump = { duracao_ms: ms(t0), tamanho_bytes: fs.statSync(dumpPath).size };
      report.backup_em = new Date().toISOString();
    } else {
      report.dump = { tamanho_bytes: fs.statSync(dumpPath).size, origem: 'arquivo fornecido' };
      report.backup_em = args.backupAt || null;
    }

    const t1 = performance.now();
    const targetCli = connectionForCli(targetUrl, 'RESTORE_DATABASE_URL');
    run('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', targetCli.connectionString, dumpPath], targetCli.env);
    report.restauracao = { duracao_ms: ms(t1) };

    const chk = new Client({ connectionString: targetUrl });
    await chk.connect();
    let dstState;
    try {
      dstState = await snapshot(chk, { readOnly: true });
    } finally {
      await chk.end();
    }

    const problems = [];
    if (srcState) problems.push(...compareSnapshots(srcState, dstState, { tolerateLiveDrift: args.tolerateLiveDrift }));
    const repoCheck = checkAgainstRepoMigrations(dstState);
    problems.push(...repoCheck.problems);
    problems.push(...checkSequences(dstState));
    const pool = appPoolCheck(targetUrl);
    if (!pool.ok) problems.push('aplicação não conseguiu ler o banco restaurado');

    report.verificacao = {
      servidor_origem: srcState ? srcState.version : null,
      servidor_restore: dstState.version,
      tabelas: dstState.tables.length,
      linhas_por_tabela: dstState.counts,
      migrations_restauradas: dstState.migrations.length,
      migrations_pendentes_no_repo: repoCheck.pendingMigrations,
      conexao_pool_da_aplicacao: pool.ok,
      divergencias: problems,
    };
    // RTO do exercício = restauração + verificação. Na operação real some provisionamento do destino,
    // obtenção do backup, DNS/troca de DATABASE_URL e redeploy.
    report.rto_observado_ms = ms(t1);
    report.ultimo_pedido_restaurado = dstState.lastOrderAt;
    if (report.backup_em && dstState.lastOrderAt) {
      report.rpo_observado_s = Math.max(
        0,
        Math.round((Date.parse(report.backup_em) - Date.parse(dstState.lastOrderAt)) / 1000)
      );
    }
    report.resultado = problems.length ? 'FALHA' : 'OK';
    report.finalizado_em = new Date().toISOString();
  } finally {
    if (!args.dumpFile) fs.rmSync(workDir, { recursive: true, force: true });
  }

  const text = JSON.stringify(report, null, 2);
  if (args.report) {
    fs.mkdirSync(path.dirname(path.resolve(args.report)), { recursive: true });
    fs.writeFileSync(args.report, `${text}\n`);
  }
  console.log(text);
  return report.resultado === 'OK' ? 0 : 1;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof DrillError ? `❌ ${err.message}` : `❌ Erro inesperado: ${err.code || err.message}`);
      process.exit(2);
    }
  );
}

module.exports = {
  DrillError,
  CONFIRM_VALUE,
  parseDbUrl,
  sameDatabase,
  connectionForCli,
  assertSafeTarget,
  parseArgs,
  compareSnapshots,
  checkSequences,
  main,
};
