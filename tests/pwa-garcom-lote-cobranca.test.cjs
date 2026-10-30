'use strict';

/**
 * Regressão de três defeitos relatados em produção pelo operador:
 *
 *  1. O diálogo de notificações não fechava depois de conceder a permissão.
 *  2. O garçom precisava aceitar/retirar/entregar item por item, pedido por
 *     pedido — o lote só existia para o aceite e só com 2+ itens prontos.
 *  3. O botão "Registrar recebimento" ficava desabilitado em silêncio. Como o
 *     QR PIX é gerado no navegador a partir do valor digitado, o garçom via o
 *     QR correto ao lado de um botão que parecia morto.
 *
 * Os testes executam as funções REAIS recortadas de app.js (ver pwa-harness),
 * não uma reimplementação.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { contexto, carregar, Elemento, source, APP_PATH } = require('./helpers/pwa-harness.cjs');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'garcom-pwa', 'index.html'), 'utf8');

/* ------------------------------------------------------------------ */
/* 1. Consentimento de notificações                                    */
/* ------------------------------------------------------------------ */

function montarConsent(permissao, confirmRecusa = true) {
  const ids = {
    notificationConsent: Object.assign(new Elemento('dialog'), { open: true }),
    consentStatus: new Elemento('p'),
    alertMessage: new Elemento('p'),
    requestNotificationPermission: new Elemento('button'),
  };
  ids.notificationConsent.close = function () { this.open = false; };
  const armazenamento = new Map();
  const ctx = contexto({
    ids,
    globais: {
      waiterToken: 'tok-teste',
      readyAlertsEnabled: false,
      localStorage: {
        getItem: (k) => (armazenamento.has(k) ? armazenamento.get(k) : null),
        setItem: (k, v) => armazenamento.set(k, String(v)),
      },
      Notification: { requestPermission: async () => permissao },
      // o handler testa `'Notification' in window` antes de pedir permissão
      window: { confirm: () => confirmRecusa, Notification: { requestPermission: async () => permissao } },
      updateNotificationStatus: () => {},
      CONSENT_SEEN: 'consent-v1-tok-teste',
    },
  });
  ctx.consentDialog = ids.notificationConsent;
  // recorta o handler real e registra como função nomeada
  const src = source();
  const inicio = src.indexOf("$('#requestNotificationPermission').addEventListener('click',async()=>{");
  assert.ok(inicio > 0, 'handler de permissão precisa existir');
  const fim = src.indexOf('\n});', inicio);
  const corpo = src.slice(inicio, fim).replace(/^[^{]*\{/, '');
  require('node:vm').runInContext('async function pedirPermissao(){' + corpo + '\n}', ctx);
  return { ctx, ids, armazenamento };
}

test('conceder notificações fecha o diálogo e confirma no painel', async () => {
  const { ctx, ids, armazenamento } = montarConsent('granted');
  await ctx.pedirPermissao();
  assert.equal(ids.notificationConsent.open, false, 'o diálogo deveria fechar após o aceite');
  assert.equal(ctx.readyAlertsEnabled, true);
  assert.equal(armazenamento.get('garcom-ready-alerts-tok-teste'), '1');
  assert.equal(armazenamento.get('consent-v1-tok-teste'), '1');
  assert.match(ids.alertMessage.textContent, /Avisos de item pronto ativados/);
});

test('recusa confirmada também fecha o diálogo e persiste a escolha', async () => {
  const { ctx, ids, armazenamento } = montarConsent('denied', true);
  await ctx.pedirPermissao();
  assert.equal(ids.notificationConsent.open, false);
  assert.equal(armazenamento.get('garcom-notifications-declined-tok-teste'), '1');
  assert.equal(ctx.readyAlertsEnabled, false, 'recusar não pode ativar avisos');
});

test('dispensar o prompt nativo mantém o diálogo aberto para nova tentativa', async () => {
  const { ctx, ids } = montarConsent('default');
  await ctx.pedirPermissao();
  assert.equal(ids.notificationConsent.open, true, 'sem decisão real o usuário continua na folha');
  assert.equal(ctx.readyAlertsEnabled, false);
});

/* ------------------------------------------------------------------ */
/* 2. Lote por pedido nas três etapas                                  */
/* ------------------------------------------------------------------ */

function item(id, status, extras = {}) {
  return { id, status, nome: 'Item ' + id, quantidade: 1, setor: 'cozinha', ...extras };
}

async function montarEntregas(itens, meuId = 7) {
  const root = new Elemento('div');
  const chamadas = [];
  const ctx = contexto({
    ids: { readyOrders: root, alertMessage: new Elemento('p') },
    globais: {
      waiterToken: 'tok',
      currentWaiterId: meuId,
      getJson: async (url, opts) => {
        if (opts && opts.method === 'POST') {
          chamadas.push({ url, body: JSON.parse(opts.body) });
          return {};
        }
        return [{ id: 42, mesa: 13, itens, responsavelMesaNome: 'Ana' }];
      },
      refreshLiveData: async () => {},
      itemStateText: (i) => i.status,
      showOrderHistory: () => {},
    },
  });
  carregar(ctx, ['avisarEntrega', 'deliveryAction', 'loadDeliveries']);
  await ctx.loadDeliveries();
  return { root, chamadas, ctx };
}

test('lote de aceite aparece mesmo com um único item pronto', async () => {
  const { root, chamadas } = await montarEntregas([item(1, 'concluido')]);
  const botao = root.botoes().find((b) => /Aceitar todos os prontos \(1\)/.test(b.textContent));
  assert.ok(botao, 'o botão de lote precisa existir com um item só');
  await botao.onclick();
  assert.equal(chamadas.length, 1);
  assert.deepEqual(chamadas[0].body.itemIds, [1]);
  assert.equal(chamadas[0].body.etapa, 'aceitar');
});

test('lote de retirada e de entrega existem e só incluem itens do próprio garçom', async () => {
  const { root, chamadas } = await montarEntregas([
    item(1, 'aceito', { garcomAceitoId: 7 }),
    item(2, 'aceito', { garcomAceitoId: 7 }),
    item(3, 'aceito', { garcomAceitoId: 99 }), // de outro garçom
    item(4, 'retirado', { garcomRetirouId: 7 }),
    item(5, 'retirado', { garcomRetirouId: 99 }), // de outro garçom
  ]);
  const retirar = root.botoes().find((b) => /Confirmar retirada de todos \(2\)/.test(b.textContent));
  const entregar = root.botoes().find((b) => /Confirmar entrega de todos \(1\)/.test(b.textContent));
  assert.ok(retirar, 'lote de retirada ausente');
  assert.ok(entregar, 'lote de entrega ausente');

  await retirar.onclick();
  assert.deepEqual(chamadas[0].body.itemIds, [1, 2], 'não pode levar item de outro garçom');
  assert.equal(chamadas[0].body.etapa, 'retirar');
  assert.match(chamadas[0].url, /\/retirar$/);

  await entregar.onclick();
  assert.deepEqual(chamadas[1].body.itemIds, [4]);
  assert.equal(chamadas[1].body.etapa, 'entregar');
});

test('lote nunca mistura etapas numa mesma chamada', async () => {
  const { root, chamadas } = await montarEntregas([
    item(1, 'concluido'),
    item(2, 'aceito', { garcomAceitoId: 7 }),
    item(3, 'retirado', { garcomRetirouId: 7 }),
  ]);
  const lotes = root.botoes().filter((b) => /todos/.test(b.textContent));
  assert.equal(lotes.length, 3, 'uma ação de lote por etapa disponível');
  for (const b of lotes) await b.onclick();
  assert.equal(chamadas.length, 3);
  assert.deepEqual(chamadas.map((c) => c.body.etapa), ['aceitar', 'retirar', 'entregar']);
  for (const c of chamadas) assert.equal(c.body.itemIds.length, 1);
});

test('falha no lote avisa inline e reabilita os botões, sem alert bloqueante', async () => {
  const root = new Elemento('div');
  const aviso = new Elemento('p');
  const ctx = contexto({
    ids: { readyOrders: root, alertMessage: aviso },
    globais: {
      waiterToken: 'tok',
      currentWaiterId: 7,
      getJson: async (url, opts) => {
        if (opts && opts.method === 'POST') throw new Error('Conflito: item já foi retirado');
        return [{ id: 42, mesa: 13, itens: [item(1, 'concluido'), item(2, 'concluido')] }];
      },
      refreshLiveData: async () => {},
      itemStateText: (i) => i.status,
      showOrderHistory: () => {},
    },
  });
  carregar(ctx, ['avisarEntrega', 'deliveryAction', 'loadDeliveries']);
  await ctx.loadDeliveries();
  const botao = root.botoes().find((b) => /Aceitar todos os prontos/.test(b.textContent));
  await botao.onclick();
  assert.match(aviso.textContent, /Conflito/);
  assert.deepEqual(ctx.__alerts, [], 'não deve usar alert() bloqueante');
  assert.equal(botao.disabled, false, 'botão precisa voltar a funcionar após o erro');
});

test('cancelar a confirmação não envia nada ao servidor', async () => {
  const root = new Elemento('div');
  const chamadas = [];
  const ctx = contexto({
    ids: { readyOrders: root, alertMessage: new Elemento('p') },
    globais: {
      waiterToken: 'tok',
      currentWaiterId: 7,
      confirm: () => false,
      getJson: async (url, opts) => {
        if (opts && opts.method === 'POST') { chamadas.push(url); return {}; }
        return [{ id: 42, mesa: 13, itens: [item(1, 'concluido')] }];
      },
      refreshLiveData: async () => {},
      itemStateText: (i) => i.status,
      showOrderHistory: () => {},
    },
  });
  carregar(ctx, ['avisarEntrega', 'deliveryAction', 'loadDeliveries']);
  await ctx.loadDeliveries();
  await root.botoes().find((b) => /Aceitar todos/.test(b.textContent)).onclick();
  assert.equal(chamadas.length, 0);
});

/* ------------------------------------------------------------------ */
/* 3. Cobrança: bloqueio sempre explicado                              */
/* ------------------------------------------------------------------ */

function idsCobranca() {
  const ids = {
    billingSession: new Elemento('select'),
    billingSummary: new Elemento('div'),
    billingBlocked: new Elemento('p'),
    billingMessage: new Elemento('p'),
    registerPayment: new Elemento('button'),
    billingAmount: new Elemento('input'),
    billingMethod: Object.assign(new Elemento('select'), { value: 'pix' }),
    billingReceivedConfirm: new Elemento('input'),
  };
  ids.billingBlocked.hidden = true;
  return ids;
}

function ctxCobranca({ ids, resumo, erro, mesas = [], meuId = 7, pendente = null, online = true }) {
  const ctx = contexto({
    ids,
    globais: {
      waiterToken: 'tok',
      currentWaiterId: meuId,
      mesas,
      pendingWaiterPayment: pendente,
      navigator: { onLine: online },
      getJson: async () => { if (erro) throw erro; return resumo; },
      updateBillingConfirmation: () => {},
      loadBillingSummary: null,
    },
  });
  carregar(ctx, ['bloquearCobranca', 'liberarCobranca', 'loadBillingSummary', 'renderBillingSessions']);
  return ctx;
}

test('saldo zero por falta de entrega explica a causa e não deixa botão mudo', async () => {
  const ids = idsCobranca();
  const opt = new Elemento('option'); opt.value = '55'; ids.billingSession.append(opt); ids.billingSession.value = '55';
  const ctx = ctxCobranca({ ids, resumo: { mesa: 13, valorTotal: 0, valorPago: 0, valorRestante: 0 } });
  await ctx.loadBillingSummary();
  assert.equal(ids.registerPayment.disabled, true);
  assert.equal(ids.billingBlocked.hidden, false, 'o motivo precisa estar visível');
  assert.match(ids.billingBlocked.textContent, /Nenhum item desta mesa foi marcado como entregue/);
  assert.match(ids.billingBlocked.textContent, /Confirmar as entregas|Confirme as entregas/i);
});

test('conta quitada diz que está quitada e aponta o Caixa', async () => {
  const ids = idsCobranca();
  const opt = new Elemento('option'); opt.value = '55'; ids.billingSession.append(opt); ids.billingSession.value = '55';
  const ctx = ctxCobranca({ ids, resumo: { mesa: 13, valorTotal: 90, valorPago: 90, valorRestante: 0 } });
  await ctx.loadBillingSummary();
  assert.equal(ids.registerPayment.disabled, true);
  assert.match(ids.billingBlocked.textContent, /já está quitada/);
  assert.match(ids.billingBlocked.textContent, /Caixa/);
});

test('havendo saldo o botão libera e o aviso desaparece', async () => {
  const ids = idsCobranca();
  const opt = new Elemento('option'); opt.value = '55'; ids.billingSession.append(opt); ids.billingSession.value = '55';
  const ctx = ctxCobranca({ ids, resumo: { mesa: 13, valorTotal: 90, valorPago: 20, valorRestante: 70 } });
  await ctx.loadBillingSummary();
  assert.equal(ids.registerPayment.disabled, false);
  assert.equal(ids.billingBlocked.hidden, true);
  assert.equal(ids.billingBlocked.textContent, '');
  assert.match(ids.billingSummary.textContent, /Saldo: R\$ 70,00/);
});

test('403 explica que a mesa é de outro responsável', async () => {
  const ids = idsCobranca();
  const opt = new Elemento('option'); opt.value = '55'; ids.billingSession.append(opt); ids.billingSession.value = '55';
  const erro = Object.assign(new Error('Somente o garçom responsável atual'), { status: 403 });
  const ctx = ctxCobranca({ ids, erro });
  await ctx.loadBillingSummary();
  assert.equal(ids.registerPayment.disabled, true);
  assert.match(ids.billingBlocked.textContent, /não é o responsável atual desta mesa/);
});

test('sem conexão o bloqueio é explicado em vez de botão apagado', async () => {
  const ids = idsCobranca();
  const opt = new Elemento('option'); opt.value = '55'; ids.billingSession.append(opt); ids.billingSession.value = '55';
  const ctx = ctxCobranca({ ids, resumo: {}, online: false });
  await ctx.loadBillingSummary();
  assert.equal(ids.registerPayment.disabled, true);
  assert.match(ids.billingBlocked.textContent, /Sem conexão/);
});

test('garçom sem mesa própria recebe motivo claro, não botão mudo', () => {
  const ids = idsCobranca();
  const ctx = ctxCobranca({ ids, resumo: {}, mesas: [{ numero: 13, sessaoId: 55, garcomResponsavelId: 99 }] });
  ctx.renderBillingSessions();
  assert.equal(ids.registerPayment.disabled, true);
  assert.equal(ids.billingBlocked.hidden, false);
  assert.match(ids.billingBlocked.textContent, /não é o responsável atual de nenhuma mesa/);
});

test('comparação de responsável tolera id em texto (não vira lista vazia)', () => {
  const ids = idsCobranca();
  const ctx = ctxCobranca({
    ids, resumo: { mesa: 13, valorTotal: 50, valorPago: 0, valorRestante: 50 },
    mesas: [{ numero: 13, sessaoId: 55, garcomResponsavelId: '7' }],
    meuId: 7,
  });
  ctx.renderBillingSessions();
  assert.equal(ids.billingSession.options.length, 1, 'mesa do garçom precisa aparecer');
  assert.equal(ids.billingSession.value, '55');
});

test('perfil não carregado pede reconexão em vez de acusar falta de mesa', () => {
  const ids = idsCobranca();
  const ctx = ctxCobranca({ ids, resumo: {}, mesas: [], meuId: null });
  ctx.renderBillingSessions();
  assert.match(ids.billingBlocked.textContent, /identificar seu cadastro de garçom/);
});

test('tentativa pendente de outra mesa bloqueia explicando o que resolver', async () => {
  const ids = idsCobranca();
  const opt = new Elemento('option'); opt.value = '55'; ids.billingSession.append(opt); ids.billingSession.value = '55';
  const ctx = ctxCobranca({
    ids, resumo: { mesa: 13, valorTotal: 90, valorPago: 0, valorRestante: 90 },
    pendente: { sessaoId: 99, mesa: 20, valor: 10, formaPagamento: 'pix', key: 'k' },
  });
  await ctx.loadBillingSummary();
  assert.equal(ids.registerPayment.disabled, true);
  assert.match(ids.billingBlocked.textContent, /tentativa pendente da mesa 20/);
});

/* ------------------------------------------------------------------ */
/* Guardas de shell                                                    */
/* ------------------------------------------------------------------ */

test('aviso de bloqueio existe no HTML com live region e estilo próprio', () => {
  assert.match(HTML, /id="billingBlocked"[^>]*aria-live="polite"/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'garcom-pwa', 'styles.css'), 'utf8');
  assert.match(css, /\.billing-blocked\{/, 'o aviso precisa de destaque visual legível no celular');
});

test('não sobrou comparação de id sem coerção numérica', () => {
  const src = source();
  assert.doesNotMatch(src, /===currentWaiterId/, 'use Number(currentWaiterId) para não quebrar com id em texto');
  assert.doesNotMatch(src, /!==currentWaiterId/);
});

test('registrar recebimento não referencia variável inexistente (botão morto)', async () => {
  // Causa real do "botão de confirmar pagamento não funciona": o objeto usava
  // o shorthand `sessaoId`, mas a variável local se chama `sessionId`. O
  // ReferenceError matava o handler ANTES de qualquer fetch, sem mensagem na
  // tela — o botão parecia não fazer nada.
  const ids = idsCobranca();
  const opt = new Elemento('option'); opt.value = '55'; ids.billingSession.append(opt); ids.billingSession.value = '55';
  ids.billingAmount.value = '90';
  ids.billingReceivedConfirm.checked = true;
  const envios = [];
  const ctx = contexto({
    ids,
    globais: {
      waiterToken: 'tok',
      currentWaiterId: 7,
      mesas: [{ numero: 13, sessaoId: 55, garcomResponsavelId: 7 }],
      pendingWaiterPayment: null,
      pendingPaymentStorageKey: 'pending-pay',
      navigator: { onLine: true },
      uid: () => 'chave-idem-1',
      localStorage: { setItem: () => {}, removeItem: () => {} },
      getJson: async (url, opts) => {
        envios.push({ url, body: JSON.parse(opts.body) });
        return { pagamento: { valor: 90 }, valorRestante: 0, sessaoFechada: false };
      },
      loadMesas: async () => {},
    },
  });
  carregar(ctx, ['bloquearCobranca', 'liberarCobranca', 'loadBillingSummary', 'submitWaiterPayment']);
  await ctx.submitWaiterPayment();
  assert.equal(envios.length, 1, 'o handler precisa chegar a enviar a requisição');
  assert.equal(envios[0].body.valor, 90);
  assert.equal(envios[0].body.idempotencyKey, 'chave-idem-1');
  assert.match(envios[0].url, /\/sessoes\/55\/pagamentos$/);
  assert.match(ids.billingMessage.textContent, /Recebimento registrado/);
  assert.equal(ctx.pendingWaiterPayment, null);
});

test('pagamento que quita a conta avisa que a mesa foi liberada', async () => {
  const ids = idsCobranca();
  const opt = new Elemento('option'); opt.value = '55'; ids.billingSession.append(opt); ids.billingSession.value = '55';
  ids.billingAmount.value = '90';
  ids.billingReceivedConfirm.checked = true;
  const ctx = contexto({
    ids,
    globais: {
      waiterToken: 'tok', currentWaiterId: 7,
      mesas: [{ numero: 13, sessaoId: 55, garcomResponsavelId: 7 }],
      pendingWaiterPayment: null, pendingPaymentStorageKey: 'k',
      navigator: { onLine: true }, uid: () => 'chave-2',
      localStorage: { setItem: () => {}, removeItem: () => {} },
      getJson: async () => ({ pagamento: { valor: 90 }, valorRestante: 0, sessaoFechada: true }),
      loadMesas: async () => {},
    },
  });
  carregar(ctx, ['bloquearCobranca', 'liberarCobranca', 'loadBillingSummary', 'submitWaiterPayment']);
  await ctx.submitWaiterPayment();
  assert.match(ids.billingMessage.textContent, /Conta quitada, atendimento encerrado e mesa liberada/);
});

test('app.js segue com sintaxe válida como módulo ESM (não só como script)', () => {
  // `node --check arquivo.js` analisa como CommonJS e DEIXA PASSAR erro de
  // sintaxe que o navegador rejeita — foi exatamente assim que um `finally`
  // órfão chegou a quebrar o PWA inteiro em produção enquanto os testes
  // passavam. O app.js usa `import`, então a checagem precisa ser em .mjs.
  const fs = require('node:fs');
  const os = require('node:os');
  const cp = require('node:child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-esm-'));
  try {
    for (const arquivo of ['app.js', 'sw.js', 'offline.js']) {
      const destino = path.join(tmp, arquivo.replace(/\.js$/, '.mjs'));
      fs.copyFileSync(path.join(__dirname, '..', 'public', 'garcom-pwa', arquivo), destino);
      cp.execFileSync(process.execPath, ['--check', destino], { stdio: 'pipe' });
    }
  } catch (e) {
    assert.fail('Sintaxe ESM inválida no shell do PWA: ' + (e.stderr ? e.stderr.toString() : e.message));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
