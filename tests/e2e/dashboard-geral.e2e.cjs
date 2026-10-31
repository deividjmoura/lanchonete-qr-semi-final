'use strict';
// Dashboard interativo sobre o build real com API simulada.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;
const { criarDashboard, aguardarLayoutDashboard } = require('./fixtures/dashboard.cjs');
const base = process.env.VISUAL_BASE_URL || 'http://localhost:4173';

async function novoContexto(browser, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion, serviceWorkers: 'block' });
  await context.addInitScript(() => sessionStorage.setItem('pub-auth', JSON.stringify({ role: 'admin', nome: 'Admin' })));
  const estado = { pedidos: [], erro: false, parcial: false, atrasarMes: false, liberarMes: null, chegouMes: null };
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/me') return route.fulfill({ json: { staff: { id: 1, papel: 'admin', nome: 'Admin', deveTrocarSenha: false }, csrfToken: 'csrf' } });
    if (path === '/api/admin/dashboard') {
      const periodo = url.searchParams.get('periodo');
      estado.pedidos.push(periodo);
      if (estado.atrasarMes && periodo === 'mes') {
        await new Promise((resolve) => { estado.liberarMes = resolve; estado.chegouMes?.(); });
      }
      if (estado.erro) return route.fulfill({ status: 503, json: { error: 'Indisponível' } });
      if (estado.parcial) return route.fulfill({ json: { periodo: { chave: periodo }, faturamento: 0 } });
      const faturamento = { hoje: 1284.5, semana: 5200, mes: 21100 }[periodo];
      return route.fulfill({ json: criarDashboard({
        periodo, faturamento, contasFechadas: 24, pedidosTotal: 42,
        pagamentos: { formas: [{ forma: 'pix', valor: 400 }, { forma: 'cartao_debito', valor: 500 }], semDetalhamento: 384.5, excedente: 5 },
        topProdutos: Array.from({ length: 8 }, (_, i) => ({ nome: `Item especial ${i + 1}`, quantidade: 30 - i })),
      }) });
    }
    if (path.includes('event')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': teste\n\n' });
    return route.fulfill({ json: [] });
  });
  return { context, estado };
}

async function main() {
  const browser = await chromium.launch({
    executablePath: await binary.executablePath(),
    args: [...binary.args.filter((a) => a !== '--single-process' && a !== '--no-zygote'), '--no-sandbox'],
    headless: true,
  });
  try {
    const { context, estado } = await novoContexto(browser);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/#/admin', { waitUntil: 'load' });
    const grupo = page.getByRole('group', { name: 'Período do dashboard' });
    await grupo.getByRole('button', { name: 'Hoje' }).waitFor();
    assert.equal(await grupo.getByRole('button', { name: 'Hoje' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.card-neon').count(), 12);
    const faturamento = page.getByRole('button', { name: /Detalhar Faturamento/ });
    await faturamento.getByText('R$ 1.284,50').waitFor();

    // As opções de cards funcionam por teclado, têm nome e foco retorna ao
    // acionador ao fechar com Escape (dialog nativo/modal).
    await faturamento.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Faturamento' });
    await dialog.waitFor();
    await dialog.getByText('Período anterior', { exact: true }).waitFor();
    await dialog.getByText('Média por dia', { exact: true }).waitFor();
    await dialog.getByText('Média equivalente a 7 dias').waitFor();
    await dialog.getByText('Histórico do período').waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await faturamento.evaluate((e) => document.activeElement === e), 'foco retorna ao card');

    const detalhes = [
      ['Pedidos', 'Média de pedidos por dia'], ['Ticket médio', 'Faturamento'],
      ['Contas fechadas', 'Média por dia'], ['Taxa de serviço', 'Descontos no período'],
      ['Pagamentos', 'Sem detalhamento de pagamento'], ['Mais pedidos', 'Item especial 8'],
      ['Tempo de entrega', 'Unidades com horário de entrega'], ['Consumo em aberto', 'Saldo pendente estimado'],
      ['Mesas ocupadas', 'Mesas livres'], ['Garçons ativos', 'Garçons com cadastro ativo'],
      ['Itens em operação', 'Prontos para retirada'],
    ];
    for (const [nome, conteudo] of detalhes) {
      await page.getByRole('button', { name: new RegExp(`^Detalhar ${nome}:`) }).click();
      const modal = page.getByRole('dialog', { name: nome, exact: true });
      await modal.getByText(conteudo, { exact: false }).first().waitFor();
      if (nome === 'Pagamentos') {
        await modal.getByText('Cartão de débito').waitFor();
        await modal.getByText(/lançamentos acima do valor cobrado/).waitFor();
      }
      if (['Consumo em aberto', 'Mesas ocupadas', 'Garçons ativos', 'Itens em operação'].includes(nome)) {
        await modal.getByText(/independente do (filtro|período)/).first().waitFor();
      }
      await modal.getByRole('button', { name: 'Fechar detalhes' }).click();
      await modal.waitFor({ state: 'hidden' });
    }
    const ranking = page.getByRole('region', { name: 'Mais pedidos' });
    assert.equal(await ranking.locator('li').count(), 5);
    await ranking.getByRole('button', { name: 'Carregar mais' }).click();
    assert.equal(await ranking.locator('li').count(), 8);
    await ranking.getByRole('button', { name: 'Mostrar menos' }).click();
    assert.equal(await ranking.locator('li').count(), 5);

    await grupo.getByRole('button', { name: 'Semana' }).click();
    await faturamento.getByText('R$ 5.200,00').waitFor();
    assert.equal(await grupo.getByRole('button', { name: 'Semana' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.dash-chart__track').count(), 5);
    await page.getByRole('button', { name: /Detalhar Mesas ocupadas/ }).getByText('4 / 12').waitFor();
    await page.reload();
    await faturamento.getByText('R$ 5.200,00').waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('qradmin-dashboard-periodo')), 'semana');
    assert.equal(estado.pedidos.at(-1), 'semana', 'sessão preserva o período ao recarregar');

    // Uma resposta antiga e lenta nunca troca os dados do período escolhido depois.
    estado.atrasarMes = true;
    const chegouMes = new Promise((resolve) => { estado.chegouMes = resolve; });
    await grupo.getByRole('button', { name: 'Mês' }).click();
    await chegouMes;
    await grupo.getByRole('button', { name: 'Hoje' }).click();
    await faturamento.getByText('R$ 1.284,50').waitFor();
    estado.liberarMes();
    await page.waitForTimeout(150);
    assert.equal(await grupo.getByRole('button', { name: 'Hoje' }).getAttribute('aria-pressed'), 'true');
    await faturamento.getByText('R$ 1.284,50').waitFor();
    estado.atrasarMes = false;

    // Sem resposta (ou contrato incompleto), não inventar zeros nem reutilizar
    // o período anterior. A tela oferece recuperação explícita.
    estado.erro = true;
    await grupo.getByRole('button', { name: 'Mês' }).click();
    await page.getByRole('alert').getByText(/Não foi possível carregar/).waitFor();
    assert.equal(await faturamento.isDisabled(), true);
    assert.equal(await faturamento.locator('.metric-value').textContent(), '—');
    assert.equal(await page.locator('.dash-chart__track').count(), 0);
    estado.erro = false;
    estado.parcial = true;
    const respostaParcial = page.waitForResponse((response) => response.url().includes('/api/admin/dashboard?periodo=mes'));
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await respostaParcial;
    // Esperar a tentativa de fato falhar, em vez de encontrar o alerta antigo.
    await page.getByRole('alert').getByText(/Não foi possível carregar/).waitFor();
    assert.equal(await faturamento.locator('.metric-value').textContent(), '—');
    estado.parcial = false;
    const respostaCompleta = page.waitForResponse((response) => response.url().includes('/api/admin/dashboard?periodo=mes'));
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await respostaCompleta;
    await faturamento.getByText('R$ 21.100,00').waitFor();
    assert.equal(await page.locator('.dash-chart__track').count(), 30);

    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await aguardarLayoutDashboard(page, width);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `sem overflow em ${width}px`);
      assert.ok(await page.locator('.metric-value').evaluateAll((values) => values.every((e) => e.scrollWidth <= e.clientWidth)), `valores sem truncar em ${width}px`);
    }

    // Mouse fora dos cards também altera o tilt, sem state por mousemove.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.mouse.move(300, 20);
    await page.waitForTimeout(60);
    const primeiro = await page.locator('.dashboard-stage').evaluate((e) => e.style.getPropertyValue('--dash-hx'));
    const transform1 = await page.locator('.card-neon').first().evaluate((e) => getComputedStyle(e).transform);
    await page.mouse.move(1300, 20);
    await page.waitForTimeout(60);
    const segundo = await page.locator('.dashboard-stage').evaluate((e) => e.style.getPropertyValue('--dash-hx'));
    const transform2 = await page.locator('.card-neon').first().evaluate((e) => getComputedStyle(e).transform);
    assert.notEqual(primeiro, segundo, 'parallax acompanha o mouse fora dos cards');
    assert.notEqual(transform1, transform2, 'variáveis alteram o transform');
    assert.deepEqual(errors, []);
    await context.close();

    const reduzido = await novoContexto(browser, 'reduce');
    const reducedPage = await reduzido.context.newPage();
    await reducedPage.goto(base + '/#/admin');
    await reducedPage.getByRole('button', { name: /Detalhar Faturamento/ }).getByText('R$ 1.284,50').waitFor();
    await reducedPage.mouse.move(1300, 20);
    await reducedPage.waitForTimeout(60);
    assert.equal(await reducedPage.locator('.card-neon').first().evaluate((e) => getComputedStyle(e).transform), 'none');
    assert.equal(await reducedPage.locator('.dashboard-stage').evaluate((e) => e.style.getPropertyValue('--dash-hx')), '0');
    await reduzido.context.close();
    console.log('✓ Dashboard: períodos, detalhes, acessibilidade, erro, layout e parallax global/reduced motion.');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
