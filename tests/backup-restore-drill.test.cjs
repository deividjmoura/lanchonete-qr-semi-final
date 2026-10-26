'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DrillError,
  CONFIRM_VALUE,
  parseDbUrl,
  sameDatabase,
  assertSafeTarget,
  parseArgs,
  compareSnapshots,
  checkSequences,
} = require('../scripts/backup-restore-drill');

const src = parseDbUrl('postgres://u:p@db.prod.example:5432/qradmin', 'src');
const dst = parseDbUrl('postgres://u:p@db.scratch.example:5432/qradmin_restore_drill', 'dst');

test('parseDbUrl extrai host/porta/banco e nunca expõe a senha', () => {
  assert.deepEqual(src, { host: 'db.prod.example', port: '5432', database: 'qradmin' });
  assert.ok(!JSON.stringify(src).includes(':p@'));
  assert.throws(() => parseDbUrl('', 'x'), DrillError);
  assert.throws(() => parseDbUrl('mysql://h/db', 'x'), DrillError);
  assert.throws(() => parseDbUrl('postgres://h/', 'x'), DrillError);
});

test('sameDatabase compara host, porta e banco', () => {
  assert.equal(sameDatabase(src, { ...src }), true);
  assert.equal(sameDatabase(src, { ...src, port: '5433' }), false);
});

test('assertSafeTarget exige confirmação explícita', () => {
  assert.throws(() => assertSafeTarget({ source: src, target: dst, confirm: undefined }), /RESTORE_DRILL_CONFIRM/);
  assert.doesNotThrow(() => assertSafeTarget({ source: src, target: dst, confirm: CONFIRM_VALUE }));
});

test('assertSafeTarget recusa destino igual à origem, mesmo com confirmação', () => {
  assert.throws(
    () => assertSafeTarget({ source: src, target: { ...src }, confirm: CONFIRM_VALUE }),
    /mesmo banco da origem/
  );
});

test('assertSafeTarget recusa nome de banco que não indica ambiente descartável', () => {
  const prodLike = parseDbUrl('postgres://u:p@other.host/railway', 'dst');
  assert.throws(() => assertSafeTarget({ source: src, target: prodLike, confirm: CONFIRM_VALUE }), /descartável/);
  const noSource = parseDbUrl('postgres://u:p@other.host/producao', 'dst');
  assert.throws(() => assertSafeTarget({ source: null, target: noSource, confirm: CONFIRM_VALUE }), /descartável/);
});

test('parseArgs aceita flags conhecidas e rejeita desconhecidas', () => {
  assert.deepEqual(parseArgs(['--report', 'r.json', '--tolerate-live-drift']), {
    report: 'r.json',
    dumpFile: null,
    backupAt: null,
    tolerateLiveDrift: true,
  });
  assert.throws(() => parseArgs(['--drop-everything']), DrillError);
  assert.throws(() => parseArgs(['--backup-at', 'ontem']), /ISO/);
});

const base = () => ({
  tables: ['pedidos', 'schema_migrations'],
  counts: { pedidos: 3, schema_migrations: 2 },
  migrations: ['0001.sql', '0002.sql'],
  constraints: 5,
  indexes: 4,
  sequences: { pedidos_id_seq: 3 },
  sequenceLags: [],
});

test('compareSnapshots: restore idêntico não gera divergência', () => {
  assert.deepEqual(compareSnapshots(base(), base()), []);
});

test('compareSnapshots detecta tabela ausente, contagem, índice e sequence divergentes', () => {
  const bad = base();
  bad.tables = ['schema_migrations'];
  bad.counts = { schema_migrations: 2 };
  bad.indexes = 3;
  bad.sequences = { pedidos_id_seq: 1 };
  const problems = compareSnapshots(base(), bad).join('\n');
  assert.match(problems, /tabelas ausentes/);
  assert.match(problems, /índices/);
  assert.match(problems, /sequence pedidos_id_seq/);

  const lessRows = base();
  lessRows.counts.pedidos = 2;
  assert.match(compareSnapshots(base(), lessRows).join('\n'), /contagem divergente em pedidos/);
});

test('compareSnapshots com origem viva tolera crescimento da origem, mas não perda no restore', () => {
  const live = base();
  live.counts.pedidos = 10; // origem recebeu pedidos depois do dump
  assert.deepEqual(compareSnapshots(live, base(), { tolerateLiveDrift: true }), []);
  const phantom = base();
  phantom.counts.pedidos = 99; // restore com MAIS linhas que a origem é impossível
  assert.match(compareSnapshots(base(), phantom, { tolerateLiveDrift: true }).join('\n'), /pedidos/);
});

test('checkSequences reporta sequence atrás do maior id', () => {
  assert.deepEqual(checkSequences({ sequenceLags: [] }), []);
  assert.match(checkSequences({ sequenceLags: ['pedidos_id_seq=1 < max(pedidos.id)=9'] })[0], /atrás do maior id/);
});
