'use strict';
// Production build, synthetic API. No database or production traffic.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;
const { criarDashboard } = require('./fixtures/dashboard.cjs');
const base = process.env.VISUAL_BASE_URL;
if (!base) throw Error('Use npm run test:e2e (VISUAL_BASE_URL ausente)');
const nome = 'Hambúrguer artesanal com queijo, bacon e molho especial da casa';
const produto = { id: 1, nome, preco: 1234.56, disponivel: true, controlaEstoque: true, estoque: 3, estoqueMinimo: 5, fotoUrl: '/assets/demo/burger.webp', setor: 'cozinha' };
const metricas = { id: 1, nome: 'Funcionária com nome comprido para testar a leitura no celular', removido: false, atendimentos: 5, vendas: 100, vendasBrutas: 100, taxaServico: 10, descontos: 0, totalCobrado: 110, ticketMedio: 22, pedidosRegistrados: 5, pedidosComEntregaRegistrada: 4, mesasAssumidas: 3, itensAssumidos: 6, itensRetirados: 4, itensEntregues: 4, transferenciasRecebidas: 1, transferenciasRealizadas: 0, outrosEventos: [] };
const panorama = { mesas: [], pracas: [], config: { quantidade: 0, limite: 70, faixas: { atencaoMinutos: 45, criticoMinutos: 90 } }, vendas: { periodo: 'hoje', porMesa: [] }, fluxo: { janela: { horas: 24 }, etapas: [], setores: {}, amostraMinima: 5, limiteEtapaHoras: 24 } };
let writes = 0;
async function mock(route) {
  const req = route.request(), url = new URL(req.url()), p = url.pathname;
  let data = [];
  if (p === '/api/me') data = { staff: { id: 1, papel: 'admin', nome: 'Admin', deveTrocarSenha: false } };
  else if (p.includes('/event')) return route.fulfill({ contentType: 'text/event-stream', body: ': ok\n\n' });
  else if (p.endsWith('/cardapio')) data = [{ id: 1, nome: 'Hambúrgueres artesanais', ordem: 0, produtos: [produto] }];
  else if (p === '/api/admin/dashboard') data = criarDashboard();
  else if (p === '/api/admin/garcons/metricas') data = { garcons: [metricas] };
  else if (p === '/api/admin/garcons') data = [{ id: 1, nome: metricas.nome, token: 'sintetico', ativo: true }];
  else if (p.includes('panorama')) data = panorama;
  else if (p === '/api/admin/relatorio') data = { resumo: { faturamento: 110, totalCobrado: 110, contasFechadas: 1 }, porDia: [{ dia: '2026-11-05', contas: 1, vendasBrutas: 100, servicoTotal: 10, descontosTotal: 0, totalCobrado: 110 }], contas: [{ id: 1, mesa: 18, cliente: 'Nome de cliente bastante longo para validar a quebra no relatório', valorCobrado: 110, forma: 'pix', fechadaEm: '2026-11-05T18:00:00' }], porGarcom: [{ garcomId: 1, garcomNome: metricas.nome, contas: 1, vendasBrutas: 100, servicoTotal: 10, descontosTotal: 0, totalCobrado: 110 }] };
  else if (p.startsWith('/api/admin/produtos/') && req.method() !== 'GET') { writes++; Object.assign(produto, req.postDataJSON()); data = { ok: true }; }
  return route.fulfill({ json: data });
}
async function noOverflow(page, label) {
  const widths = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  assert.ok(widths.page <= widths.viewport + 1, `${label}: página ${widths.page}px > viewport ${widths.viewport}px`);
}
async function main() {
  const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter((a) => a !== '--single-process'), headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        sessionStorage.setItem('pub-auth', JSON.stringify({ role: 'admin', nome: 'Admin' }));
        window.EventSource = class { addEventListener() {} close() {} };
      });
      await context.route('**/api/**', mock);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      for (const section of ['', 'cardapio', 'garcons', 'funcoes', 'mesas']) {
        await page.goto(`${base}/#/admin/${section}`);
        await page.locator('.admin-page').waitFor();
        await page.waitForTimeout(400);
        assert.deepEqual(errors, [], `sem erros JS em ${width}/${section}`);
        await noOverflow(page, `${width}/${section}`);
        if (section === 'cardapio') {
          await page.locator('[data-drag-handle]').first().click();
          const card = page.locator('.admin-product').first();
          await card.waitFor();
          await noOverflow(page, `${width}/produto expandido`);
          if (width < 640) {
            assert.equal(await card.evaluate((el) => getComputedStyle(el).display), 'grid');
            assert.ok(await card.getByText(nome, { exact: true }).evaluate((el) => el.scrollHeight <= el.clientHeight + 1), 'nome não cortado');
            assert.ok(await card.getByRole('button', { name: `Editar ${nome}`, exact: true }).evaluate((el) => el.getBoundingClientRect().height >= 44));
          }
          page.once('dialog', (d) => d.accept('8'));
          await card.getByRole('button', { name: `Definir estoque de ${nome}`, exact: true }).click();
          await page.getByRole('button', { name: `Editar ${nome}`, exact: true }).click();
          await page.locator('.admin-dialog').waitFor();
          const dialogWidth = await page.locator('.admin-dialog').evaluate((el) => [el.clientWidth, el.scrollWidth]);
          assert.ok(dialogWidth[1] <= dialogWidth[0] + 1, 'formulário sem overflow horizontal');
          await page.locator('.admin-dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
          if (process.env.MOBILE_SCREENSHOTS_DIR && width === 390) {
            const fs = require('node:fs'); fs.mkdirSync(process.env.MOBILE_SCREENSHOTS_DIR, { recursive: true });
            await page.screenshot({ path: `${process.env.MOBILE_SCREENSHOTS_DIR}/cardapio-mobile.png`, fullPage: true });
          }
        }
        if (section === 'funcoes') {
          await page.getByRole('region', { name: 'Relatório por dia', exact: true }).waitFor();
          assert.equal(await page.locator('.admin-data-table').first().locator('td[data-label]').count(), 6, 'todos os valores do relatório preservados');
        }
        if (section === 'garcons') {
          await page.getByText(metricas.nome, { exact: true }).first().waitFor();
          const table = page.locator('.admin-data-table').first();
          assert.equal(await table.evaluate((el) => getComputedStyle(el).display), width < 640 ? 'block' : 'table');
          assert.equal(await table.locator('tbody tr').first().locator('[data-label]').count(), 16, 'todos os indicadores preservados');
          await noOverflow(page, `${width}/equipe carregada`);
        }
      }
      if (width < 1024) {
        await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
        const drawer = page.getByRole('dialog', { name: 'Navegação principal' });
        await drawer.waitFor();
        await drawer.getByRole('button', { name: 'Cardápio', exact: true }).click();
        await page.getByRole('heading', { name: 'Cardápio & Estoque', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Abrir menu', exact: true }).getAttribute('aria-expanded'), 'false');
      }
      assert.deepEqual(errors, [], `sem erros JS em ${width}px`);
      await context.close();
    }
    assert.ok(writes >= 4, 'controle de estoque continua enviando a mutação');
    console.log('✓ Admin: 320/390/768/1440px, cinco abas, produto, estoque, modal, equipe e gaveta sem overflow.');
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
