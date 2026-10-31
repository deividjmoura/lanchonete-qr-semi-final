'use strict';

/**
 * Utilitários puros da tela de panorama (src/lib/panorama.ts).
 *
 * Transpila o TypeScript real do produto (sem copiar a lógica para o teste),
 * como nos testes do sistema visual/design system. Cobre filtros por praça,
 * resumo financeiro e formatação de tempo.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'panorama.ts'), 'utf8');
const js = ts.transpileModule(fonte, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const modulo = { exports: {} };
new Function('module', 'exports', js)(modulo, modulo.exports);
const P = modulo.exports;

const agora = Date.parse('2026-10-31T20:00:00Z');
const faixas = { atencaoMinutos: 45, criticoMinutos: 90 };
const minutosAtras = (min) => new Date(agora - min * 60000).toISOString();

function mesa(over = {}) {
  return {
    id: over.numero ?? 1,
    numero: over.numero ?? 1,
    token: 'token',
    status: 'livre',
    pracaId: null,
    pracaNome: null,
    pracaOrdem: null,
    sessaoId: null,
    abertaEm: null,
    tempo: null,
    clienteNome: null,
    garcomResponsavelId: null,
    garcomResponsavelNome: null,
    consumo: 0,
    pago: 0,
    saldo: 0,
    pedidosAtivos: 0,
    pedidosRecebidos: 0,
    pedidosPreparo: 0,
    pedidosProntos: 0,
    itensNaFila: 0,
    itensProntosRetirada: 0,
    ...over,
  };
}

const praia = { id: 1, nome: 'Praia', ordem: 1, mesas: 0 };
const salao = { id: 2, nome: 'Salão', ordem: 2, mesas: 0 };

test('faixaOcupacao espelha os limites do backend', () => {
  assert.equal(P.faixaOcupacao(minutosAtras(10), agora, faixas).id, 'recente');
  assert.equal(P.faixaOcupacao(minutosAtras(45), agora, faixas).id, 'atencao');
  assert.equal(P.faixaOcupacao(minutosAtras(90), agora, faixas).id, 'critica');
  assert.equal(P.faixaOcupacao(null, agora, faixas), null);
  assert.equal(P.faixaOcupacao('', agora, faixas), null);
  assert.equal(P.faixaOcupacao('lixo', agora, faixas), null);
});

test('formatarDuracao é compacto e nunca inventa número', () => {
  assert.equal(P.formatarDuracao(8), '8 min');
  assert.equal(P.formatarDuracao(59.4), '59 min');
  assert.equal(P.formatarDuracao(60), '1h');
  assert.equal(P.formatarDuracao(65), '1h05');
  assert.equal(P.formatarDuracao(158), '2h38');
  assert.equal(P.formatarDuracao(null), '—');
  assert.equal(P.formatarDuracao(undefined), '—');
});

test('filtro por praça inclui "todas", "sem" e uma praça específica', () => {
  const mesas = [
    mesa({ numero: 1, pracaId: 1, pracaNome: 'Praia' }),
    mesa({ numero: 2, pracaId: 2, pracaNome: 'Salão' }),
    mesa({ numero: 3, pracaId: null }),
  ];
  assert.equal(P.filtrarMesas(mesas, 'todas').length, 3);
  assert.deepEqual(P.filtrarMesas(mesas, 1).map((m) => m.numero), [1]);
  assert.deepEqual(P.filtrarMesas(mesas, 'sem').map((m) => m.numero), [3]);
  // Filtro de uma praça que não existe não vaza mesas de outras.
  assert.deepEqual(P.filtrarMesas(mesas, 99), []);
});

test('resumo separa consumo em aberto, já pago e vendas', () => {
  const mesas = [
    mesa({ numero: 1, sessaoId: 10, consumo: 40, pago: 15, saldo: 25, tempo: { id: 'recente' }, pedidosAtivos: 1 }),
    mesa({ numero: 2, sessaoId: 11, consumo: 20, pago: 0, saldo: 20, tempo: { id: 'critica' }, pedidosAtivos: 2 }),
    mesa({ numero: 3, sessaoId: null }),
  ];
  const resumo = P.resumirMesas(mesas);
  assert.equal(resumo.total, 3);
  assert.equal(resumo.ocupadas, 2);
  assert.equal(resumo.livres, 1);
  assert.equal(resumo.criticas, 1);
  assert.equal(resumo.consumo, 60);
  assert.equal(resumo.pago, 15);
  assert.equal(resumo.saldo, 45);
  assert.equal(resumo.pedidosAtivos, 3);

  const vendas = {
    periodo: 'hoje',
    timezone: 'America/Sao_Paulo',
    desde: '2026-10-31',
    ate: '2026-10-31',
    porMesa: [
      { numero: 1, contas: 2, total: 80 },
      { numero: 2, contas: 1, total: 30 },
      { numero: 3, contas: 4, total: 200 },
    ],
  };
  // Mesa 3 está fora do filtro: vendas acompanham o filtro atual.
  assert.deepEqual(P.resumirVendas(vendas, mesas.slice(0, 2)), { total: 110, contas: 3 });
  assert.deepEqual(P.resumirVendas(null, mesas), { total: 0, contas: 0 });
});

test('resumoPorPraca inclui Sem praça e conta ocupadas/críticas', () => {
  const mesas = [
    mesa({ numero: 1, pracaId: 1, sessaoId: 10, tempo: { id: 'critica' } }),
    mesa({ numero: 2, pracaId: 1 }),
    mesa({ numero: 3, pracaId: 2, sessaoId: 11, tempo: { id: 'atencao' } }),
    mesa({ numero: 4, pracaId: null, sessaoId: 12, tempo: { id: 'critica' } }),
  ];
  const resumo = P.resumoPorPraca(mesas, [salao, praia]);
  // Ordem segue a ordem da praça, não a ordem de chegada.
  assert.deepEqual(resumo.map((r) => r.nome), ['Praia', 'Salão', 'Sem praça']);
  assert.deepEqual(resumo[0], { id: 1, nome: 'Praia', total: 2, ocupadas: 1, criticas: 1 });
  assert.deepEqual(resumo[1], { id: 2, nome: 'Salão', total: 1, ocupadas: 1, criticas: 0 });
  assert.deepEqual(resumo[2], { id: 'sem', nome: 'Sem praça', total: 1, ocupadas: 1, criticas: 1 });
});

test('rótulos de faixa combinam texto e cor (não dependem de cor sozinha)', () => {
  for (const id of ['recente', 'atencao', 'critica']) {
    const faixa = P.FAIXAS_TEMPO[id];
    assert.ok(faixa.rotulo.length > 3, `${id} precisa de rótulo textual`);
    assert.match(faixa.classe, /border-status-(success|warning|danger)-border/);
    assert.match(faixa.ponto, /bg-status-(success|warning|danger)/);
  }
  assert.equal(P.ROTULO_PERIODO.hoje, 'hoje');
  assert.equal(P.ROTULO_PERIODO.semana, 'nesta semana');
  assert.equal(P.ROTULO_PERIODO.mes, 'neste mês');
});
