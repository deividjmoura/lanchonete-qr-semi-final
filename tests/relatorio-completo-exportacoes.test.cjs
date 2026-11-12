'use strict';

/**
 * Issue #299 — Relatórios completos em períodos longos e exportações (CSV/PDF).
 * Cobre validações puras de datas/paginação/fuso, ausência de truncagem em
 * 500/200 e geração completa de CSV e PDF.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://regress:regress@127.0.0.1:5432/regress';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const raiz = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

const {
  relatorioVendas,
  MAX_PAGE_LIMIT,
  _internos: { tzSeguro, validarDataCalendario, normalizarPaginacao, sqlRangeParams },
} = require('../db/relatorio');

function transpilarTs(relativo) {
  const fonte = ler(relativo);
  const { outputText } = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = { exports: {} };
  new Function('module', 'exports', outputText)(mod, mod.exports);
  return mod.exports;
}

test('#299: db/relatorio.js não trunca mais contas fechadas em LIMIT 500', () => {
  const db = ler('db/relatorio.js');
  assert.doesNotMatch(db, /LIMIT\s+500\b/i);
  assert.match(db, /ORDER BY s\.fechada_em DESC, s\.id DESC/);
});

test('#299: public/js/admin-relatorio.js não corta a impressão silenciosamente em 200 contas', () => {
  const ui = ler('public/js/admin-relatorio.js');
  assert.doesNotMatch(ui, /\.slice\(0,\s*200\)/);
  assert.doesNotMatch(ui, /Contas fechadas \(até 200\)/);
  assert.match(ui, /<h2>Contas fechadas<\/h2>/);
});

test('#299: validação de datas rejeita datas inexistentes do calendário e intervalos invertidos', async () => {
  assert.equal(validarDataCalendario('2026-02-28'), true);
  assert.equal(validarDataCalendario('2028-02-29'), true); // bissexto
  assert.equal(validarDataCalendario('2026-02-29'), false);
  assert.equal(validarDataCalendario('2026-02-31'), false);
  assert.equal(validarDataCalendario('2026-13-01'), false);
  assert.equal(validarDataCalendario('2026-00-10'), false);
  assert.equal(validarDataCalendario('11/11/2026'), false);

  await assert.rejects(() => relatorioVendas({ from: '', to: '2026-11-10' }), (e) => e.status === 400);
  await assert.rejects(() => relatorioVendas({ from: '2026-02-31', to: '2026-03-01' }), (e) => e.status === 400);
  await assert.rejects(() => relatorioVendas({ from: '2026-11-12', to: '2026-11-10' }), (e) => e.status === 400);
});

test('#299: paginação opcional valida parâmetros e sem parâmetros retorna modo completo', () => {
  assert.deepEqual(normalizarPaginacao(), { paginado: false, page: 1, limit: null, offset: 0 });
  assert.deepEqual(normalizarPaginacao({ page: null, limit: '' }), { paginado: false, page: 1, limit: null, offset: 0 });
  assert.deepEqual(normalizarPaginacao({ page: '3', limit: '200' }), {
    paginado: true,
    page: 3,
    limit: 200,
    offset: 400,
  });
  assert.throws(() => normalizarPaginacao({ page: 0, limit: 100 }), (e) => e.status === 400);
  assert.throws(() => normalizarPaginacao({ page: 1, limit: MAX_PAGE_LIMIT + 1 }), (e) => e.status === 400);
  assert.throws(() => normalizarPaginacao({ page: 'abc', limit: 50 }), (e) => e.status === 400);
});

test('#299: intervalo SQL usa fuso America/Sao_Paulo sanitizado e limite final inclusivo (to + 1 dia)', () => {
  const anterior = process.env.APP_TIMEZONE;
  try {
    delete process.env.APP_TIMEZONE;
    assert.equal(tzSeguro(), 'America/Sao_Paulo');
    process.env.APP_TIMEZONE = "America/Sao_Paulo'; DROP TABLE mesas;--";
    assert.equal(tzSeguro(), 'America/Sao_Paulo');
    const range = sqlRangeParams('2026-01-01', '2026-12-31', tzSeguro());
    assert.match(range.textStart, /AT TIME ZONE 'America\/Sao_Paulo'/);
    assert.match(range.textEnd, /\(\$2::date \+ 1\)::timestamp\) AT TIME ZONE 'America\/Sao_Paulo'/);
    assert.deepEqual(range.values, ['2026-01-01', '2026-12-31']);
  } finally {
    if (anterior === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = anterior;
  }
});

test('#299: gerarCsvRelatorio exporta mais de 500 contas sem truncar e escapa aspas/vírgulas', () => {
  const { gerarCsvRelatorio } = transpilarTs('src/lib/relatorioCsv.ts');
  const contas = Array.from({ length: 625 }, (_, i) => ({
    id: i + 1,
    mesa: (i % 30) + 1,
    cliente: i === 624 ? 'Ana "VIP", Mesa Sul' : `Cliente ${i + 1}`,
    garcomResponsavel: 'Bruno',
    valor: 50,
    desconto: 2,
    taxaServico: 5,
    valorCobrado: 53,
    forma: 'pix',
    fechadaEm: '2026-11-10T22:00:00.000Z',
  }));
  const csv = gerarCsvRelatorio(contas);
  const linhas = csv.split('\n');
  assert.equal(linhas.length, 626, 'cabeçalho + todas as 625 contas');
  assert.match(linhas[625], /"Ana ""VIP"", Mesa Sul"/);
  assert.equal(gerarCsvRelatorio([]).split('\n').length, 1, 'período vazio gera apenas cabeçalho');
});

test('#299: imprimirRelatorioPdf renderiza >500 contas sem truncamento e sinaliza listagem parcial caso ocorra', () => {
  const vm = require('node:vm');
  const ts = require('typescript');
  let capturado = '';
  const utilsCode = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', 'src/lib/utils.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const printCode = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', 'src/lib/print.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const utilsMod = { exports: {} };
  vm.runInNewContext(utilsCode, {
    module: utilsMod,
    exports: utilsMod.exports,
    require: () => ({}),
    Intl,
    Date,
    Math,
  });
  const printMod = { exports: {} };
  const ctx = {
    module: printMod,
    exports: printMod.exports,
    require: (id) => (id === './utils' ? utilsMod.exports : require(id)),
    document: {},
    window: {
      open: () => ({
        document: {
          open() {},
          write(html) { capturado = html; },
          close() {},
        },
        focus() {},
        print() {},
      }),
    },
    setTimeout: () => 0,
    console,
    Intl,
    Date,
    Math,
  };
  vm.runInNewContext(printCode, ctx);
  const { imprimirRelatorioPdf } = printMod.exports;

  const contas = Array.from({ length: 610 }, (_, i) => ({
    id: i + 1,
    mesa: (i % 40) + 1,
    cliente: `Cliente PDF ${i + 1}`,
    garcomResponsavel: 'Carla',
    valor: 30,
    desconto: 0,
    taxaServico: 3,
    valorCobrado: 33,
    forma: 'pix',
    fechadaEm: '2026-11-10T20:00:00.000Z',
  }));
  imprimirRelatorioPdf({
    from: '2026-01-01',
    to: '2026-11-10',
    resumo: {
      vendasBrutas: 18300,
      descontosTotal: 0,
      servicoTotal: 1830,
      totalCobrado: 20130,
      contasFechadas: 610,
      ticketMedio: 33,
      itensVendidos: 610,
    },
    porForma: [{ forma: 'pix', valor: 20130, qtd: 610 }],
    topProdutos: [],
    porDia: [{ dia: '2026-11-10', contas: 610, total: 20130 }],
    porGarcom: [{ garcom: 'Carla', contas: 610, consumo: 18300, servico: 1830, descontos: 0, totalCobrado: 20130 }],
    contas,
  });
  assert.match(capturado, /Contas fechadas \(610\)/);
  assert.match(capturado, /Cliente PDF 1\b/);
  assert.match(capturado, /Cliente PDF 610\b/);
  assert.doesNotMatch(capturado, /listagem parcial/);

  imprimirRelatorioPdf({
    from: '2026-01-01',
    to: '2026-11-10',
    resumo: { contasFechadas: 610, totalCobrado: 20130 },
    contas: contas.slice(0, 100),
  });
  assert.match(capturado, /listagem parcial \(100 de 610 contas fechadas do período\)/);
});

