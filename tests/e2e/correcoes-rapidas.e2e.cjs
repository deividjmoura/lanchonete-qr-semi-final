'use strict';

// E2E sem banco: usa o build servido por vite preview e respostas de API simuladas.
// O runner compartilha VISUAL_BASE_URL com visual-system.e2e.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;

const base = process.env.VISUAL_BASE_URL || 'http://localhost:4173';
const screenshots = process.env.QUICK_WINS_SCREENSHOTS_DIR;
const valores = [0, 1, 1234.56, 99999999.99, 0.01, 87.65, 70000];
const dias = ['Sáb', 'Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Hoje'];
const dinheiro = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function criarMenu() {
  return ['Bebidas', 'Lanches', 'Porções', 'Sobremesas'].map((nome, index) => ({
    id: index + 1,
    nome,
    ordem: index,
    produtos: [{
      id: index + 1,
      nome: 'Produto ' + (index + 1),
      preco: 12.5,
      setor: 'cozinha',
      controlaEstoque: true,
      estoque: 10,
    }],
  }));
}

function mockApi(menu) {
  return async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    let data = [];
    if (p === '/api/me') data = { staff: { id: 1, papel: 'admin', nome: 'Admin', deveTrocarSenha: false }, csrfToken: 'csrf-test' };
    else if (p === '/api/admin/cardapio' || p === '/api/cardapio') data = menu;
    else if (p === '/api/admin/dashboard') data = {
      faturamento: 70000,
      pedidosTotal: 5,
      ticketMedio: 100,
      contasFechadas: 5,
      emAberto: { valorEntregue: 45 },
      porDia: dias.map((label, i) => ({ dia: '2026-10-' + String(20 + i), label, faturamento: valores[i], contas: 1 })),
      topProdutos: [],
    };
    else if (p.endsWith('/garcons-ativos')) data = { garcons: [{ id: 1, nome: 'Ana', ativo: true }] };
    else if (p.includes('/api/garcom/') && p.endsWith('/mesas')) data = {
      garcom: { id: 1, nome: 'Ana' },
      mesas: [{ id: 1, numero: 1, token: 'mesa-teste', status: 'livre', sessaoId: null }],
    };
    else if (p.includes('/api/garcom/') && p.endsWith('/me')) data = { id: 1, nome: 'Ana' };
    else if (p.includes('/api/garcom/') && p.endsWith('/pedidos')) data = [{
      id: 301, mesa: 1, responsavelMesaNome: 'Ana',
      itens: [{ id: 401, nome: 'Produto 1', quantidade: 1, setor: 'cozinha', status: 'concluido', adicionais: [] }],
    }];
    else if (p.includes('/api/garcom/') && p.endsWith('/retirar')) data = { aviso: 'Entrega atualizada com sucesso.' };
    else if (p.includes('event')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': teste\n\n' });
    return route.fulfill({ json: data });
  };
}

async function screenshot(page, name) {
  if (!screenshots) return;
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, name + '.png'), fullPage: true });
}

async function chartAndStock(browser, scheme) {
  const menu = criarMenu();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    sessionStorage.setItem('pub-auth', JSON.stringify({ role: 'admin', nome: 'Admin' }));
  });
  await context.route('**/api/**', mockApi(menu));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(base + '/#/admin', { waitUntil: 'load' });
  await page.locator('.week-bar-value').last().waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    // Aguarda o reflow e o fim das transições do shell após trocar o viewport.
    await page.waitForTimeout(150);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const labels = page.locator('.week-bar-value');
    assert.equal(await labels.count(), 7);
    assert.deepEqual(await labels.allTextContents(), valores.map(dinheiro), `${scheme}/${width}: valores em R$`);
    const measurements = await labels.evaluateAll((elements) => {
      const lum = (rgb) => {
        const parts = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => {
          x /= 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
      };
      return elements.map((el) => {
        const r = el.getBoundingClientRect();
        const track = el.parentElement.getBoundingClientRect();
        const style = getComputedStyle(el);
        const l1 = lum(style.color), l2 = lum(style.backgroundColor);
        return {
          inside: r.left >= track.left - 0.5 && r.right <= track.right + 0.5 && r.top >= track.top - 0.5 && r.bottom <= track.bottom + 0.5,
          contrast: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
          accessible: el.parentElement.getAttribute('aria-label'),
          text: el.textContent,
        };
      });
    });
    for (const [i, m] of measurements.entries()) {
      assert.ok(m.inside, `${scheme}/${width}: valor ${i} cabe na barra`);
      assert.ok(m.contrast >= 4.5, `${scheme}/${width}: contraste do valor ${i}: ${m.contrast}`);
      assert.equal(m.accessible, `${dias[i]}: ${dinheiro(valores[i])}`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${scheme}/${width}: sem overflow horizontal`);
    if (width === 375 || width === 1440) await screenshot(page, `dashboard-${scheme}-${width}`);
  }

  // Dados indisponíveis não viram zeros falsos ou consumo em aberto no gráfico.
  const failPage = await context.newPage();
  await failPage.route('**/api/admin/dashboard', (route) => route.fulfill({ status: 503, json: { error: 'Indisponível' } }));
  await failPage.goto(base + '/#/admin');
  await failPage.getByText('Dados de vendas da semana indisponíveis.').waitFor();
  assert.equal(await failPage.locator('.week-bar-value').count(), 0);
  await failPage.close();

  await page.getByRole('button', { name: 'Funções', exact: true }).click();
  const categoria = (name) => page.getByRole('button', { name: new RegExp('^' + name + '\\b') });
  for (const nome of ['Bebidas', 'Lanches', 'Porções', 'Sobremesas']) {
    await categoria(nome).waitFor();
    assert.equal(await categoria(nome).getAttribute('aria-expanded'), 'false', `${nome} inicia recolhida`);
  }
  await categoria('Bebidas').click();
  await categoria('Lanches').click();
  assert.equal(await categoria('Bebidas').getAttribute('aria-expanded'), 'true');
  assert.equal(await categoria('Lanches').getAttribute('aria-expanded'), 'true');
  await categoria('Lanches').click();
  assert.equal(await categoria('Lanches').getAttribute('aria-expanded'), 'false');

  let releasePatch, patchArrived;
  const pendingPatch = new Promise((resolve) => { releasePatch = resolve; });
  const patchSeen = new Promise((resolve) => { patchArrived = resolve; });
  await page.route('**/api/admin/produtos/1', async (route) => {
    patchArrived();
    await pendingPatch;
    menu[0].produtos[0].estoque = 9;
    menu.push({ id: 5, nome: 'Nova categoria', ordem: 4, produtos: [{ id: 5, nome: 'Novo item', preco: 5 }] });
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByRole('button', { name: '−1', exact: true }).click();
  await patchSeen;
  await categoria('Bebidas').click();
  assert.equal(await categoria('Bebidas').getAttribute('aria-expanded'), 'false');
  releasePatch();
  await categoria('Nova categoria').waitFor(); // confirma a nova hidratação após o PATCH
  for (const nome of ['Bebidas', 'Lanches', 'Porções', 'Sobremesas', 'Nova categoria']) {
    assert.equal(await categoria(nome).getAttribute('aria-expanded'), 'false', `${nome} continua recolhida após atualização`);
  }
  assert.deepEqual(errors, []);
  await context.close();
}

async function notificationFlows(browser) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 820 }, colorScheme: 'dark', serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await context.addInitScript(() => {
    window.__permission = 'default';
    window.__permissionResult = 'granted';
    window.__permissionCalls = 0;
    window.__installed = false;
    window.__installCalls = 0;
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => window.__permission });
    Notification.requestPermission = async () => {
      window.__permissionCalls++;
      window.__permission = window.__permissionResult;
      return window.__permission;
    };
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === '(display-mode: standalone)'
      ? { matches: window.__installed, media: query, addListener() {}, removeListener() {} }
      : originalMatchMedia(query);
  });
  await context.route('**/api/**', mockApi(criarMenu()));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(base + '/garcom-pwa/?token=novo', { waitUntil: 'load' });
  await page.locator('#tableGrid .table-tile').first().waitFor();
  assert.equal(await page.locator('#notificationConsent[open]').count(), 0, 'primeira visita não bloqueia o atendimento');
  assert.equal(await page.evaluate(() => window.__permissionCalls), 0, 'nunca solicita permissão automaticamente');
  assert.equal(await page.locator('#openNotificationSettings').getAttribute('data-pending'), 'true');
  await page.locator('[data-tab="deliveries"]').click();
  await page.locator('#readyOrders .order').first().waitFor();
  assert.equal(await page.locator('#page-deliveries #notificationStatus').count(), 0, 'sem cartão permanente de configuração');
  assert.equal(await page.locator('#alertMessage').isVisible(), false, 'sem espaço ocupado quando não há recado operacional');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await screenshot(page, 'pwa-entregas-320');

  await page.locator('#openNotificationSettings').click();
  assert.equal(await page.locator('#notificationConsent').getAttribute('open'), '');
  assert.match(await page.locator('#notificationStatus').textContent(), /não instalado/i);
  assert.match(await page.locator('#installHelp').textContent(), /Safari.*Adicionar à Tela de Início/i);
  assert.equal(await page.locator('#installAppBtn').isVisible(), false);
  assert.equal(await page.evaluate(() => window.__permissionCalls), 0);
  await screenshot(page, 'pwa-configuracoes-320');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#openNotificationSettings').dataset.pending === 'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('garcom-notification-intro-v1-novo')), '1');
  await page.reload();
  assert.equal(await page.locator('#notificationConsent[open]').count(), 0);
  assert.equal(await page.locator('#openNotificationSettings').getAttribute('data-pending'), 'false', 'dispensa persiste');
  await page.locator('#openNotificationSettings').click();

  // Instalação nativa, retorno às instruções manuais e detecção do instalado.
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = async () => { window.__installCalls++; };
    e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(e);
  });
  assert.equal(await page.locator('#installAppBtn').isVisible(), true);
  await page.locator('#installAppBtn').click();
  assert.equal(await page.evaluate(() => window.__installCalls), 1);
  assert.equal(await page.locator('#installHelp').isVisible(), true);
  await page.evaluate(() => { window.__installed = true; window.dispatchEvent(new Event('appinstalled')); });
  assert.match(await page.locator('#notificationStatus').textContent(), /PWA instalado/i);
  assert.equal(await page.locator('#installHelp').isVisible(), false);

  await page.locator('#requestNotificationPermission').click();
  await page.waitForFunction(() => !document.querySelector('#notificationConsent').open);
  assert.equal(await page.evaluate(() => window.__permissionCalls), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('garcom-ready-alerts-novo')), '1');
  assert.equal(await page.locator('#notificationFeedback').isVisible(), true, 'confirmação visível em qualquer aba');
  assert.match(await page.locator('#notificationFeedback').textContent(), /Avisos de item pronto ativados/);
  await page.locator('[data-tab="deliveries"]').click();
  await page.locator('#readyOrders .order').first().waitFor();
  assert.equal(await page.locator('#alertMessage').isVisible(), false, 'confirmação não deixa aviso permanente na fila');
  await page.waitForFunction(() => document.querySelector('#notificationFeedback').hidden, null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Retirar item', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#alertMessage').textContent.includes('Entrega atualizada'));
  assert.equal(await page.locator('#alertMessage').isVisible(), true, 'feedback de entrega continua visível fora do modal');
  assert.deepEqual(errors, []);
  await context.close();
}

async function deniedPermission(browser) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.__permission = 'default';
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => window.__permission });
    Notification.requestPermission = async () => { window.__permission = 'denied'; return 'denied'; };
  });
  await context.route('**/api/**', mockApi(criarMenu()));
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(base + '/garcom-pwa/?token=recusa');
  await page.locator('#openNotificationSettings').click();
  await page.locator('#requestNotificationPermission').click();
  await page.waitForFunction(() => !document.querySelector('#notificationConsent').open);
  assert.equal(await page.evaluate(() => localStorage.getItem('garcom-notifications-declined-recusa')), '1');
  await page.locator('#openNotificationSettings').click();
  assert.equal(await page.locator('#requestNotificationPermission').isDisabled(), true);
  assert.match(await page.locator('#notificationStatus').textContent(), /Permissão negada/);
  await context.close();
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || await binary.executablePath(),
    args: binary.args.filter((a) => a !== '--single-process'), headless: true,
  });
  try {
    for (const scheme of ['light', 'dark']) await chartAndStock(browser, scheme);
    await notificationFlows(browser);
    await deniedPermission(browser);
    console.log('✓ Gráfico, estoque e avisos do PWA validados em Chromium (API simulada).');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
