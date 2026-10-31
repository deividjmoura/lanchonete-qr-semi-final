'use strict';

// Navegação e reimpressão em Chromium real, com API simulada (sem banco).
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;

const base = process.env.VISUAL_BASE_URL || 'http://localhost:4173';
const resumo = Array.from({ length: 12 }, (_, i) => ({
  id: 1001 + i, mesa: i + 1, clienteNome: 'Cliente ' + (i + 1),
  total: 32.5 + i, fechadaEm: '2026-10-30T15:00:00.000Z',
}));

async function contexto(browser, papel = 'admin', obrigatorio = false) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  await context.addInitScript(({ papel, obrigatorio }) => {
    if (window.top === window) {
      try { sessionStorage.setItem('pub-auth', JSON.stringify({ role: papel, nome: papel, deveTrocar: obrigatorio })); } catch { /* about:blank sem acesso ao storage */ }
      // Acelera apenas o intervalo da lista, sem aguardar 20s reais para verificar o polling.
      const intervalo = window.setInterval.bind(window);
      window.setInterval = (fn, tempo, ...args) => intervalo(fn, tempo === 20000 ? 1500 : tempo, ...args);
    }
  }, { papel, obrigatorio });
  const requests = { lista: 0, detalhe: [], falhar: false };
  await context.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data = [];
    if (p === '/api/me') data = { staff: { id: 1, login: papel, papel, nome: papel, deveTrocarSenha: obrigatorio }, csrfToken: 'csrf-test' };
    else if (p === '/api/admin/dashboard') data = { faturamento: 0, pedidosTotal: 0, contasFechadas: 0, ticketMedio: 0, porDia: [], topProdutos: [] };
    else if (p === '/api/admin/mesas/config') data = { quantidade: 0, limite: 70 };
    else if (p === '/api/admin/garcons/metricas') data = { garcons: [] };
    else if (p === '/api/admin/contas') data = [{ id: 1, nome: 'Admin', login: 'admin', papel: 'admin' }];
    else if (p === '/api/caixa/comprovantes') {
      requests.lista++;
      if (requests.falhar) return route.fulfill({ status: 503, json: { error: 'Comprovantes indisponíveis' } });
      data = resumo;
    } else if (/^\/api\/admin\/sessoes\/\d+\/comprovante$/.test(p)) {
      const id = Number(p.split('/')[4]);
      requests.detalhe.push(id);
      data = {
        id, mesa: 1, clienteNome: 'Cliente 1', abertaEm: '2026-10-30T12:00:00.000Z',
        fechadaEm: '2026-10-30T15:00:00.000Z', totalConsumo: 32.5, desconto: 0, taxa: 0,
        valorCobrado: 32.5, valorPago: 32.5, saldo: 0,
        itens: [{ nome: 'Hambúrguer', quantidade: 1, precoUnitario: 32.5, adicionais: 0, total: 32.5, pedidoId: 1 }],
        pagamentos: [{ id: 1, valor: 32.5, forma: 'pix', criadoEm: '2026-10-30T15:00:00.000Z' }],
      };
    } else if (p.includes('event')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': teste\n\n' });
    return route.fulfill({ json: data });
  });
  return { context, requests };
}

async function desktop(browser) {
  const { context, requests } = await contexto(browser);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/#/admin', { waitUntil: 'load' });
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  assert.equal(await page.getByRole('navigation', { name: 'Seções administrativas' }).count(), 0, 'pill removido');
  assert.equal(await page.getByRole('button', { name: 'Redefinir senha de um setor' }).count(), 0, 'sem chave de admin no topo');
  const secoes = [
    ['Dashboard', '/admin'], ['Cardápio', '/admin/cardapio'], ['Mesas', '/admin/mesas'],
    ['Garçons', '/admin/garcons'], ['Funções', '/admin/funcoes'],
  ];
  for (const [nome, rota] of secoes) {
    await nav.getByRole('button', { name: nome, exact: true }).click();
    await page.waitForFunction((r) => location.hash === '#' + r, rota);
    await page.getByRole('heading', { name: nome, exact: true, level: 1 }).waitFor();
    assert.equal(await nav.getByRole('button', { name: nome, exact: true }).getAttribute('aria-current'), 'page');
    await page.reload();
    await page.getByRole('heading', { name: nome, exact: true, level: 1 }).waitFor();
    assert.equal(new URL(page.url()).hash, '#' + rota, `refresh preserva ${nome}`);
  }

  await page.getByRole('button', { name: 'Comprovantes', exact: true }).click();
  const section = page.getByRole('region', { name: 'Comprovantes de contas fechadas' });
  await section.getByText('Conta #1001').waitFor();
  assert.equal(await section.getByRole('button', { name: 'Imprimir' }).count(), 5, 'primeira página pequena');
  await section.getByRole('button', { name: 'Carregar mais' }).click();
  assert.equal(await section.getByRole('button', { name: 'Imprimir' }).count(), 10);
  await section.getByRole('button', { name: 'Carregar mais' }).click();
  assert.equal(await section.getByRole('button', { name: 'Imprimir' }).count(), 12);
  assert.equal(await section.getByRole('button', { name: 'Carregar mais' }).count(), 0);

  const antes = requests.lista;
  const respostaManual = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/caixa/comprovantes');
  await section.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await respostaManual;
  assert.ok(requests.lista > antes, 'atualização manual consulta a API');
  const aposManual = requests.lista;
  await page.waitForResponse((r) => new URL(r.url()).pathname === '/api/caixa/comprovantes', { timeout: 5000 });
  assert.ok(requests.lista > aposManual, 'polling consulta a API');

  requests.falhar = true;
  await section.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await section.getByRole('alert').getByText('Comprovantes indisponíveis').waitFor();
  assert.equal(await section.getByRole('button', { name: 'Imprimir' }).count(), 12, 'erro não apaga a lista anterior');
  requests.falhar = false;
  await section.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await section.getByRole('alert').waitFor({ state: 'hidden' });

  // O diálogo nativo de impressão derruba o Chromium headless em modo single-process.
  // Preservamos o iframe gerado e interceptamos apenas o timer que invocaria print().
  await page.evaluate(() => {
    const timer = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => {
      if (delay === 250 && typeof fn === 'function' && String(fn).includes('.print()')) {
        window.__impressaoAgendada = true;
        return timer(() => {}, 0);
      }
      return timer(fn, delay, ...args);
    };
  });
  await section.getByRole('button', { name: 'Imprimir' }).first().click();
  await page.locator('iframe[title="Comprovante de consumo - Mesa 1"]').waitFor({ state: 'attached' });
  const impresso = await page.locator('iframe[title="Comprovante de consumo - Mesa 1"]').contentFrame().locator('body').innerText();
  assert.match(impresso, /CONTA #1001/);
  assert.match(impresso, /Hambúrguer/);
  assert.match(impresso, /PIX/);
  assert.deepEqual(requests.detalhe, [1001], 'detalhe usa a rota administrativa');
  assert.equal(await page.evaluate(() => window.__impressaoAgendada), true, 'impressão nativa agendada');
  assert.deepEqual(errors, []);
  await context.close();
}

async function mobile(browser) {
  const { context } = await contexto(browser);
  const page = await context.newPage();
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto(base + '/#/admin', { waitUntil: 'load' });
    const trigger = page.getByRole('button', { name: 'Abrir menu' });
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Navegação principal' });
    await drawer.waitFor();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    for (const nome of ['Dashboard', 'Cardápio', 'Mesas', 'Garçons', 'Funções']) {
      await drawer.getByRole('button', { name: nome, exact: true }).waitFor({ state: 'visible' });
      assert.equal(await drawer.getByRole('button', { name: nome, exact: true }).count(), 1, `${width}: ${nome} no menu`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: sem overflow`);
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Abrir menu');
    await trigger.click();
    await drawer.getByRole('button', { name: 'Funções', exact: true }).click();
    await page.getByRole('heading', { name: 'Funções', exact: true, level: 1 }).waitFor();
    assert.equal(new URL(page.url()).hash, '#/admin/funcoes');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await page.reload();
    await page.getByRole('heading', { name: 'Funções', exact: true, level: 1 }).waitFor();
  }
  await context.close();
}

async function permissoes(browser) {
  for (const papel of ['caixa', 'cozinha', 'bar']) {
    const { context, requests } = await contexto(browser, papel);
    const page = await context.newPage();
    await page.goto(base + '/#/' + papel);
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await nav.waitFor();
    for (const nome of ['Dashboard', 'Cardápio', 'Mesas', 'Garçons', 'Funções']) {
      assert.equal(await nav.getByRole('button', { name: nome, exact: true }).count(), 0, `${papel}: sem ${nome}`);
    }
    assert.equal(await page.getByText('Comprovantes recentes').count(), 0);
    assert.equal(requests.lista, 0, `${papel}: tela não busca comprovantes`);
    assert.equal(await page.getByRole('button', { name: 'Alterar senha' }).count(), 1);
    await page.goto(base + '/#/admin/funcoes');
    await page.waitForFunction((p) => !location.hash.startsWith('#/admin'), papel);
    assert.equal(await page.getByRole('button', { name: 'Comprovantes', exact: true }).count(), 0);
    await context.close();
  }
  const { context } = await contexto(browser, 'admin', true);
  const page = await context.newPage();
  await page.goto(base + '/#/admin');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /senha inicial ou compartilhada/i, 'troca obrigatória continua aberta');
  assert.equal(await dialog.getByRole('button', { name: 'Fechar' }).count(), 0);
  await context.close();
}

(async () => {
  // Vários contextos/iframes provocam SIGTRAP no modo single-process desta
  // versão do Chromium; o modo multiprocessos mantém a mesma cobertura.
  const args = binary.args.filter((arg) => arg !== '--single-process' && arg !== '--no-zygote');
  const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: [...args, '--no-sandbox'], headless: true });
  try {
    await mobile(browser);
    await permissoes(browser);
    // A inspeção do iframe de impressão fica por último no Chromium single-process.
    await desktop(browser);
    console.log('✓ Navegação, permissões, senha e comprovantes (desktop/mobile)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
