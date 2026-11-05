'use strict';

// E2E sem banco: valida o rodapé do PWA do garçom (mobile e desktop), o aviso
// de offline confirmado pelo SyncEngine e a transferência de mesa em modal.
// Usa o build de produção servido por `vite preview` e API simulada por rotas.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;

const base = process.env.VISUAL_BASE_URL;
if (!base) {
  throw new Error('VISUAL_BASE_URL ausente. Execute npm run test:e2e para usar o preview isolado do runner.');
}

const MESAS = {
  garcom: { id: 1, nome: 'Ana' },
  mesas: [
    { id: 1, numero: 1, token: null, sessaoId: 10, clienteNome: 'Ana Prado', garcomResponsavelId: 1, garcomResponsavelNome: 'Ana' },
    { id: 2, numero: 2, token: null, sessaoId: null, clienteNome: null, garcomResponsavelId: null, garcomResponsavelNome: null },
    { id: 3, numero: 3, token: null, sessaoId: 11, clienteNome: 'Carla', garcomResponsavelId: 2, garcomResponsavelNome: 'Bruno' },
  ],
};

function mockApi(state) {
  return async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (data, status = 200) => route.fulfill({ status, json: data });

    if (p.includes('/api/garcom/') && p.endsWith('/me')) {
      if (state.offline) return route.abort('failed');
      return json({ id: 1, nome: 'Ana' });
    }
    if (state.offline) return route.abort('failed');

    if (p.endsWith('/transferir')) {
      state.transfers.push({
        mesa: p.split('/mesas/')[1].split('/')[0],
        body: req.postDataJSON(),
      });
      if (state.transferStatus >= 400) return json({ error: 'Outro garçom assumiu esta mesa' }, state.transferStatus);
      return json({ ok: true });
    }
    if (p.endsWith('/garcons-ativos')) return json({ garcons: [{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Bruno' }] });
    if (p.includes('/api/garcom/') && p.endsWith('/mesas')) return json(MESAS);
    if (p === '/api/cardapio') {
      return json([{ id: 1, nome: 'Lanches', ordem: 0, produtos: [{ id: 11, nome: 'X-Burger', preco: 20, setor: 'cozinha', controlaEstoque: false }] }]);
    }
    if (p.includes('/event')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' });
    return json([]);
  };
}

async function abrir(browser, state, viewport, scheme = 'light') {
  const context = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.route('**/api/**', mockApi(state));
  const page = await context.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(base + '/garcom-pwa/?token=rodape', { waitUntil: 'load' });
  await page.locator('#tableSearch').waitFor();
  return { context, page, erros };
}

async function rodapeNasTelas(browser, viewport, scheme) {
  const state = { offline: false, transfers: [], transferStatus: 200 };
  const { context, page, erros } = await abrir(browser, state, viewport, scheme);
  try {
    assert.equal(await page.locator('.app-header').count(), 0, 'sem faixa superior');
    assert.equal(await page.locator('.waiter-strip').count(), 0, 'sem faixa do garçom');

    const footer = await page.locator('.app-footer').boundingBox();
    assert.ok(footer, 'rodapé visível');
    assert.ok(footer.y + footer.height <= viewport.height + 1, 'rodapé dentro da tela');
    assert.ok(footer.width <= viewport.width + 1, 'rodapé sem overflow');

    for (const seletor of ['#connection', '#syncBtn', '#openNotificationSettings', '#themeToggleBtn', '#helpBtn']) {
      const box = await page.locator(seletor).boundingBox();
      assert.ok(box, seletor + ' visível');
      assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, seletor + ' cabe na largura');
      // Alvo de toque: nada abaixo de 40px de altura no rodapé.
      assert.ok(box.height >= 40 - 1, seletor + ' mantém alvo de toque de 40px');
    }
    for (const tab of ['tables', 'orders', 'deliveries', 'billing']) {
      assert.ok(await page.locator('[data-tab="' + tab + '"]').boundingBox(), 'aba ' + tab + ' no rodapé');
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, 'sem rolagem horizontal (' + viewport.width + 'px)');

    // O indicador de conexão é só ícone: nada de texto visível no rodapé.
    const textoVisivel = await page.locator('#connection').evaluate((el) =>
      [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent.trim()).join(''),
    );
    assert.equal(textoVisivel, '', 'indicador de conexão sem texto solto');
    const rotulo = await page.locator('#connection .connection-label').boundingBox();
    assert.ok(rotulo && rotulo.width <= 1, 'rótulo do indicador existe só para leitores de tela');
    assert.ok((await page.locator('#connection').getAttribute('title')).length > 3, 'conexão tem dica de título');

    // Salão completo só depois da busca, aceitando vírgula.
    assert.equal(await page.locator('#tableGrid').isVisible(), false, 'salão oculto sem busca');
    await page.locator('#tableSearch').fill('1, 2');
    await page.locator('#tableGrid .table-tile').first().waitFor();
    assert.equal(await page.locator('#tableGrid .table-tile').count(), 2, 'dois números = duas mesas');

    // Não existe uma segunda lista de mesas: o salão é a única entrada.
    assert.equal(await page.locator('#myTables').count(), 0, 'lista duplicada removida');
    assert.equal(await page.getByText('Minhas mesas', { exact: true }).count(), 0);

    // As ações da mesa responsável ficam no modal aberto pelo cartão do salão.
    await page.locator('#tableSearch').fill('Ana Prado');
    await page.locator('#tableGrid .table-tile').first().click();
    detalhe = page.locator('#tableDetailsModal');
    await detalhe.waitFor({ state: 'visible' });
    for (const label of ['Ver pedidos', 'Cobrar', 'Transferir mesa', 'Deixar mesa']) {
      assert.equal(await detalhe.getByRole('button', { name: label, exact: true }).count(), 1, label + ' no modal do responsável');
    }
    await page.locator('#closeTableDetails').click();

    // Mesa livre: oferece iniciar atendimento, nunca transferência.
    await page.locator('#tableSearch').fill('2');
    await page.locator('#tableGrid .table-tile').first().waitFor();
    await page.locator('#tableGrid .table-tile').first().click();
    let detalhe = page.locator('#tableDetailsModal');
    await detalhe.waitFor({ state: 'visible' });
    assert.equal(await detalhe.getByRole('button', { name: /Transferir mesa/ }).count(), 0);
    assert.equal(await detalhe.getByRole('button', { name: 'Iniciar atendimento' }).count(), 1);
    await page.locator('#closeTableDetails').click();

    // Mesa de outro responsável: o detalhe explica que só o responsável transfere.
    await page.locator('#tableSearch').fill('3');
    await page.locator('#tableGrid .table-tile').first().waitFor();
    await page.locator('#tableGrid .table-tile').first().click();
    detalhe = page.locator('#tableDetailsModal');
    await detalhe.waitFor({ state: 'visible' });
    assert.equal(
      await detalhe.getByRole('button', { name: /Transferir mesa/ }).count(),
      0,
      'só o responsável atual vê a transferência',
    );
    assert.match(await detalhe.innerText(), /somente o responsável atual pode transferir/i);
    await page.locator('#closeTableDetails').click();

    assert.deepEqual(erros, [], 'sem erro de página');
  } finally {
    await context.close();
  }
}

async function offlineParaOnline(browser) {
  const state = { offline: false, transfers: [], transferStatus: 200 };
  const { context, page, erros } = await abrir(browser, state, { width: 390, height: 844 });
  try {
    await page.waitForFunction(() => document.querySelector('#connection')?.dataset.net === 'online');
    assert.equal(await page.locator('#offlineNotice').isVisible(), false, 'online não mostra aviso de offline');

    // Sem resposta do servidor, mas ainda com navigator.onLine: o aviso só pode
    // aparecer quando o SyncEngine confirma a queda.
    state.offline = true;
    await page.locator('#syncBtn').click();
    await page.waitForFunction(() => document.querySelector('#connection')?.dataset.net === 'offline', null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => navigator.onLine), true, 'o navegador continua "online"');
    await page.locator('#offlineNotice').waitFor({ state: 'visible' });
    assert.match(await page.locator('#offlineNotice').innerText(), /Sem conexão confirmada com o servidor/);

    // Volta a rede: o próximo ciclo confirma e esconde o aviso.
    state.offline = false;
    await page.locator('#syncBtn').click();
    await page.waitForFunction(() => document.querySelector('#connection')?.dataset.net === 'online', null, { timeout: 15000 });
    await page.locator('#offlineNotice').waitFor({ state: 'hidden' });
    assert.deepEqual(erros, [], 'sem erro de página');
  } finally {
    await context.close();
  }
}

async function transferenciaNoModal(browser) {
  const state = { offline: false, transfers: [], transferStatus: 200 };
  const { context, page, erros } = await abrir(browser, state, { width: 390, height: 844 });
  try {
    const modal = page.locator('#transferModal');
    const abrirTransferencia = async () => {
      await page.locator('#tableSearch').fill('1');
      await page.locator('#tableGrid .table-tile').first().click();
      const detalhe = page.locator('#tableDetailsModal');
      await detalhe.waitFor({ state: 'visible' });
      const transferir = detalhe.getByRole('button', { name: 'Transferir mesa', exact: true });
      await transferir.click();
      await modal.waitFor({ state: 'visible' });
    };

    // Cancelar: nada vai para o servidor.
    await abrirTransferencia();
    assert.match(await page.locator('#transferSummary').innerText(), /Mesa 01 — Ana Prado/);
    assert.equal(state.transfers.length, 0, 'abrir o modal não envia requisição');
    assert.equal(await page.locator('#transferWaiter').inputValue(), '', 'ninguém pré-selecionado');
    await page.locator('#cancelTransfer').click();
    await modal.waitFor({ state: 'hidden' });
    assert.equal(state.transfers.length, 0, 'cancelar não envia requisição');

    // Confirmar: um único POST com o garçom escolhido.
    await abrirTransferencia();
    await page.locator('#transferWaiter').selectOption('2');
    await page.locator('#confirmTransfer').click();
    await page.waitForFunction(() => document.querySelector('#transferModal')?.open === false, null, { timeout: 15000 });
    assert.equal(state.transfers.length, 1, 'uma requisição por confirmação');
    assert.deepEqual(state.transfers[0], { mesa: '1', body: { garcomDestinoId: 2 } });
    assert.match(await page.locator('#tableMessage').innerText(), /transferida para Bruno/);

    // Recusa do servidor: modal permanece aberto com o erro, sem fechar na cara do garçom.
    state.transferStatus = 409;
    await abrirTransferencia();
    await page.locator('#transferWaiter').selectOption('2');
    await page.locator('#confirmTransfer').click();
    await page.waitForFunction(() => /Outro garçom assumiu/.test(document.querySelector('#transferMessage')?.textContent || ''));
    assert.equal(await modal.evaluate((el) => el.open), true, 'modal continua aberto após 409');
    assert.equal(state.transfers.length, 2, 'a recusa não duplica a requisição');
    assert.deepEqual(erros, [], 'sem erro de página');
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || (await binary.executablePath()),
    args: binary.args.filter((a) => a !== '--single-process'),
    headless: true,
  });
  try {
    for (const scheme of ['light', 'dark']) {
      for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
        await rodapeNasTelas(browser, viewport, scheme);
      }
    }
    await offlineParaOnline(browser);
    await transferenciaNoModal(browser);
    console.log('✓ Rodapé (mobile e desktop), aviso offline confirmado e transferência em modal validados em Chromium.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
