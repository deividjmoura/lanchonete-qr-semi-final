'use strict';

/**
 * Cobrança no PWA do garçom precisa fechar no mesmo valor do caixa:
 * consumo entregue + serviço padrão da casa (10%).
 *
 * Defeito relatado: o saldo vinha só com o consumo, então o garçom "quitava"
 * a mesa sem cobrar o serviço e o fechamento gravava taxa zero.
 *
 * Executa a função REAL `loadBillingSummary` recortada do app.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { contexto, carregar, Elemento } = require('./helpers/pwa-harness.cjs');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'garcom-pwa', 'index.html'), 'utf8');

function idsCobranca() {
  const ids = {
    billingSession: new Elemento('select'),
    billingSummary: new Elemento('div'),
    billingBlocked: new Elemento('p'),
    billingMessage: new Elemento('p'),
    billingServiceNote: new Elemento('p'),
    registerPayment: new Elemento('button'),
    billingAmount: new Elemento('input'),
    billingMethod: Object.assign(new Elemento('select'), { value: 'pix' }),
    billingReceivedConfirm: new Elemento('input'),
  };
  ids.billingBlocked.hidden = true;
  return ids;
}

function montar({ resumo, meuId = 7, pendente = null }) {
  const ids = idsCobranca();
  const opt = new Elemento('option');
  opt.value = '55';
  ids.billingSession.append(opt);
  ids.billingSession.value = '55';
  const ctx = contexto({
    ids,
    globais: {
      waiterToken: 'tok',
      currentWaiterId: meuId,
      mesas: [{ numero: 13, sessaoId: 55, garcomResponsavelId: meuId }],
      pendingWaiterPayment: pendente,
      navigator: { onLine: true },
      getJson: async () => resumo,
      updateBillingConfirmation: () => {},
      loadBillingSummary: null,
    },
  });
  carregar(ctx, ['bloquearCobranca', 'liberarCobranca', 'loadBillingSummary']);
  return { ctx, ids };
}

test('saldo do garçom inclui o serviço e já vem preenchido para o fechamento', async () => {
  const { ctx, ids } = montar({
    resumo: {
      mesa: 13,
      valorTotal: 50,
      valorPago: 0,
      valorRestante: 50,
      taxaServicoPercentual: 10,
      taxaServico: 5,
      valorTotalComServico: 55,
      valorRestanteComServico: 55,
    },
  });
  await ctx.loadBillingSummary();
  const texto = ids.billingSummary.textContent;
  assert.match(texto, /Consumo: R\$ 50,00/);
  assert.match(texto, /Serviço \(10%\): R\$ 5,00/);
  assert.match(texto, /Total: R\$ 55,00/);
  assert.match(texto, /Saldo: R\$ 55,00/);
  assert.equal(ids.billingAmount.value, '55.00', 'campo já vem com o valor do fechamento');
  assert.match(ids.billingServiceNote.textContent, /já inclui o serviço de 10%/);
  assert.equal(ids.registerPayment.disabled, false);
});

test('serviço aparece também quando já houve pagamento parcial', async () => {
  const { ctx, ids } = montar({
    resumo: {
      mesa: 13,
      valorTotal: 100,
      valorPago: 60,
      valorRestante: 40,
      taxaServicoPercentual: 10,
      taxaServico: 10,
      valorTotalComServico: 110,
      valorRestanteComServico: 50,
    },
  });
  await ctx.loadBillingSummary();
  assert.match(ids.billingSummary.textContent, /Já recebido: R\$ 60,00/);
  assert.match(ids.billingSummary.textContent, /Saldo: R\$ 50,00/);
  assert.equal(ids.billingAmount.value, '50.00');
});

test('conta quitada inclui o serviço no cálculo e explica que fechou', async () => {
  const { ctx, ids } = montar({
    resumo: {
      mesa: 13,
      valorTotal: 90,
      valorPago: 99,
      valorRestante: 0,
      taxaServicoPercentual: 10,
      taxaServico: 9,
      valorTotalComServico: 99,
      valorRestanteComServico: 0,
    },
  });
  await ctx.loadBillingSummary();
  assert.equal(ids.registerPayment.disabled, true);
  assert.match(ids.billingBlocked.textContent, /já está quitada/);
  assert.equal(ids.billingAmount.value, '', 'conta quitada não sugere cobrança');
});

test('servidor antigo sem campos de serviço não inventa taxa', async () => {
  const { ctx, ids } = montar({
    resumo: { mesa: 13, valorTotal: 90, valorPago: 20, valorRestante: 70 },
  });
  await ctx.loadBillingSummary();
  assert.match(ids.billingSummary.textContent, /Saldo: R\$ 70,00/);
  assert.doesNotMatch(ids.billingSummary.textContent, /Serviço/);
  assert.equal(ids.billingServiceNote.textContent, '');
});

test('HTML reserva o aviso do serviço e não promete fechamento sem taxa', () => {
  assert.match(HTML, /id="billingServiceNote"[^>]*aria-live="polite"/);
  assert.match(HTML, /O saldo já inclui o serviço padrão da casa/);
});

/* ------------------------------------------------------------------ */
/* Envio do pagamento                                                  */
/* ------------------------------------------------------------------ */

test('pagamento enviado pela PWA pede o serviço padrão ao servidor', async () => {
  const ids = idsCobranca();
  const opt = new Elemento('option');
  opt.value = '55';
  ids.billingSession.append(opt);
  ids.billingSession.value = '55';
  ids.billingAmount.value = '55.00';
  ids.billingReceivedConfirm.checked = true;
  const envios = [];
  const ctx = contexto({
    ids,
    globais: {
      waiterToken: 'tok',
      currentWaiterId: 7,
      mesas: [{ numero: 13, sessaoId: 55, garcomResponsavelId: 7 }],
      pendingWaiterPayment: null,
      pendingPaymentStorageKey: 'pending',
      navigator: { onLine: true },
      uid: () => 'chave-servico',
      localStorage: { setItem: () => {}, removeItem: () => {} },
      getJson: async (url, opts) => {
        envios.push({ url, body: JSON.parse(opts.body) });
        return {
          pagamento: { valor: 55 },
          valorRestante: 0,
          taxaServico: 5,
          valorCobrado: 55,
          sessaoFechada: true,
        };
      },
      loadMesas: async () => {},
    },
  });
  carregar(ctx, ['bloquearCobranca', 'liberarCobranca', 'loadBillingSummary', 'submitWaiterPayment']);
  await ctx.submitWaiterPayment();
  assert.equal(envios.length, 1);
  assert.equal(envios[0].body.incluirServico, true, 'servidor precisa saber que o valor já inclui serviço');
  assert.equal(envios[0].body.valor, 55);
  assert.match(ids.billingMessage.textContent, /inclui R\$ 5,00 de serviço/);
  assert.match(ids.billingMessage.textContent, /mesa liberada/);
});
