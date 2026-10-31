'use strict';

/**
 * Panorama de mesas — contrato de tempos e finanças (PR 1).
 *
 * Sem banco: cobre a lógica pura exportada por db/mesas-panorama.js e trava as
 * regras do SQL que impedem "tempo inventado" (par de horários reais, ordem
 * cronológica, janela e teto de sanidade).
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://regress:regress@127.0.0.1:5432/regress';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  FAIXAS_PADRAO,
  faixaOcupacao,
  normalizarFaixas,
  montarFluxo,
} = require('../db/mesas-panorama');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const fonte = read('db/mesas-panorama.js');
const agora = Date.parse('2026-10-31T18:00:00Z');
const minutosAtras = (min) => new Date(agora - min * 60000).toISOString();

test('faixa de ocupação não reutiliza os 15 min da fila de pedidos', () => {
  const faixas = FAIXAS_PADRAO;
  assert.deepEqual(faixas, { atencaoMinutos: 45, criticoMinutos: 90 });

  assert.equal(faixaOcupacao(minutosAtras(0), agora, faixas).id, 'recente');
  assert.equal(faixaOcupacao(minutosAtras(15), agora, faixas).id, 'recente');
  assert.equal(faixaOcupacao(minutosAtras(44), agora, faixas).id, 'recente');
  assert.equal(faixaOcupacao(minutosAtras(45), agora, faixas).id, 'atencao');
  assert.equal(faixaOcupacao(minutosAtras(89), agora, faixas).id, 'atencao');
  assert.equal(faixaOcupacao(minutosAtras(90), agora, faixas).id, 'critica');
  assert.equal(faixaOcupacao(minutosAtras(300), agora, faixas).id, 'critica');
});

test('faixa de ocupação é indisponível sem horário e nunca fica negativa', () => {
  assert.equal(faixaOcupacao(null, agora, FAIXAS_PADRAO), null);
  assert.equal(faixaOcupacao('', agora, FAIXAS_PADRAO), null);
  assert.equal(faixaOcupacao('data-invalida', agora, FAIXAS_PADRAO), null);
  // Relógio do aparelho atrasado em relação ao servidor: mostra 0 min, não -N.
  const futuro = new Date(agora + 10 * 60000).toISOString();
  assert.equal(faixaOcupacao(futuro, agora, FAIXAS_PADRAO).minutos, 0);
});

test('faixas personalizadas e valores inválidos caem nos padrões da casa', () => {
  const custom = faixaOcupacao(minutosAtras(30), agora, { atencaoMinutos: 20, criticoMinutos: 40 });
  assert.equal(custom.id, 'atencao');
  assert.equal(custom.atencaoMinutos, 20);

  assert.deepEqual(normalizarFaixas({}), FAIXAS_PADRAO);
  assert.deepEqual(normalizarFaixas({ atencao_minutos: 0, critico_minutos: 10 }), FAIXAS_PADRAO);
  // Crítico antes da atenção é corrigido para depois da atenção.
  const corrigido = normalizarFaixas({ atencaoMinutos: 60, criticoMinutos: 30 });
  assert.equal(corrigido.atencaoMinutos, 60);
  assert.ok(corrigido.criticoMinutos > corrigido.atencaoMinutos);
});

test('montarFluxo usa amostras reais e sinaliza indisponível/aproximado', () => {
  const fluxo = montarFluxo(
    [
      {
        chave: 'cozinha',
        n_recebimento_inicio: 12,
        m_recebimento_inicio: 3.456,
        n_inicio_pronto: 0,
        m_inicio_pronto: null,
        n_pronto_retirada: 2,
        m_pronto_retirada: 4.1,
        n_retirada_entrega: 1,
        m_retirada_entrega: 2,
      },
      { chave: 'garcom', n_pronto_retirada: 7, m_pronto_retirada: 1.25, n_retirada_entrega: 6, m_retirada_entrega: 2.5 },
    ],
    { horas: 24, desde: '2026-10-30T18:00:00.000Z', ate: '2026-10-31T18:00:00.000Z' },
  );

  const cozinha = fluxo.setores.cozinha.etapas;
  assert.equal(cozinha.recebimento_inicio.minutos, 3.5);
  assert.equal(cozinha.recebimento_inicio.amostras, 12);
  assert.equal(cozinha.recebimento_inicio.aproximado, false);
  // Sem item com o par de horários: indisponível, não zero.
  assert.equal(cozinha.inicio_pronto.disponivel, false);
  assert.equal(cozinha.inicio_pronto.minutos, null);
  assert.equal(cozinha.inicio_pronto.amostras, 0);
  // Amostra pequena: valor aparece, mas marcado como aproximado.
  assert.equal(cozinha.pronto_retirada.minutos, 4.1);
  assert.equal(cozinha.pronto_retirada.aproximado, true);

  const garcom = fluxo.setores.garcom.etapas;
  // O garçom não participa das duas primeiras etapas de produção.
  assert.equal(garcom.recebimento_inicio.aplicavel, false);
  assert.equal(garcom.inicio_pronto.aplicavel, false);
  assert.equal(garcom.pronto_retirada.minutos, 1.3);
  assert.equal(garcom.retirada_entrega.amostras, 6);
  assert.equal(garcom.retirada_entrega.aproximado, false);

  assert.equal(fluxo.janela.horas, 24);
  assert.equal(fluxo.etapas.length, 4);
  assert.equal(fluxo.amostraMinima, 5);
});

test('montarFluxo lida com resposta vazia sem inventar números', () => {
  const fluxo = montarFluxo([], { horas: 24 });
  for (const setor of ['cozinha', 'bar', 'garcom']) {
    for (const etapa of fluxo.etapas) {
      const medida = fluxo.setores[setor].etapas[etapa.id];
      assert.equal(medida.minutos, null);
      assert.equal(medida.disponivel, false);
      assert.equal(medida.amostras, 0);
    }
  }
});

test('SQL dos tempos exige o par de horários reais e respeita ordem e teto', () => {
  // Cada etapa é condicionada aos dois timestamps existirem.
  for (const [de, para] of [
    ['iniciado_em', 'pronto_em'],
    ['pronto_em', 'retirado_em'],
    ['retirado_em', 'entregue_em'],
  ]) {
    assert.match(
      fonte,
      new RegExp(`${de} IS NOT NULL AND ip\\.${para} IS NOT NULL`),
      `${de} → ${para} precisa exigir os dois horários`,
    );
  }
  // Nunca conta chegada antes da saída, nem passo acima do limite de sanidade.
  assert.match(fonte, /ip\.iniciado_em >= ped\.criado_em/);
  assert.match(fonte, /ip\.pronto_em >= ip\.iniciado_em/);
  assert.match(fonte, /ip\.retirado_em >= ip\.pronto_em/);
  assert.match(fonte, /ip\.entregue_em >= ip\.retirado_em/);
  assert.match(fonte, /LIMITE_ETAPA_HORAS = 12/);
  assert.match(fonte, /\(\$2::int \* interval '1 hour'\)/);
  // Nenhuma média é preenchida com now()/status atual.
  assert.doesNotMatch(fonte, /m_\w+\s*:\s*now\(\)/);
});

test('consumo em aberto vem de itens entregues; vendas vêm de contas fechadas', () => {
  assert.match(fonte, /COALESCE\(ip\.status, 'recebido'\) = 'entregue'/);
  assert.match(fonte, /itens_pedido_adicionais/);
  assert.match(fonte, /FROM sessao_pagamentos/);
  assert.match(fonte, /s\.status = 'fechada'/);
  assert.match(fonte, /COALESCE\(s\.valor_cobrado, s\.valor_total, 0\)/);
  // Saldo nunca fica negativo; consumo não é abatido da receita do período.
  assert.match(fonte, /Math\.max\(0, consumo - pago\)/);
  assert.match(fonte, /vendas/);
  assert.match(fonte, /periodo/);
});

test('panorama devolve todas as mesas habilitadas, inclusive livres', () => {
  assert.match(fonte, /FROM mesas m/);
  assert.match(fonte, /LEFT JOIN sessao s ON s\.mesa_id = a\.id/);
  assert.match(fonte, /m\.numero <= COALESCE\(\(SELECT quantidade FROM configuracao_mesas WHERE id = 1\), 20\)/);
  assert.match(fonte, /status: ocupada \? 'ocupada' : 'livre'/);
  assert.match(fonte, /pracaNome: linha\.praca_nome \|\| null/);
  assert.match(fonte, /LEFT JOIN mesa_pracas pr ON pr\.id = a\.praca_id/);
});
