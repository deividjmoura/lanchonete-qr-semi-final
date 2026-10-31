'use strict';
// Componentes de listas já carregadas, sobre o build real com API simulada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;
const { criarDashboard } = require('./fixtures/dashboard.cjs');
const base = process.env.VISUAL_BASE_URL || 'http://localhost:4173';

const contas = Array.from({ length: 31 }, (_, i) => ({
  id: i + 1, mesa: i + 1, cliente: `Cliente ${i + 1}`, valor: 10,
  desconto: 0, taxaServico: 1, valorCobrado: 11, forma: 'pix', fechadaEm: '2042-06-02T12:00:00Z',
}));
const relatorio = {
  resumo: { faturamento: 385, contasFechadas: 35, ticketMedio: 11,
    vendasBrutas: 350, servicoTotal: 35, descontosTotal: 0, totalCobrado: 385,
    topProdutos: Array.from({ length: 8 }, (_, i) => ({ nome: `Top ${i + 1}`, qtd: 8 - i })) },
  contas,
  porDia: Array.from({ length: 25 }, (_, i) => ({ dia: `2042-06-${String(i + 1).padStart(2, '0')}`, contas: 1, faturamento: 11 })),
  porGarcom: Array.from({ length: 25 }, (_, i) => ({ garcomId: i + 1, garcomNome: `Garçom ${i + 1}`, contas: 1, totalCobrado: 11 })),
};
const menu = [{ id: 1, nome: 'Categoria longa', ordem: 0, produtos: Array.from({ length: 23 }, (_, i) => ({
  id: i + 1, nome: `Estoque ${i + 1}`, preco: 10, controlaEstoque: true, estoque: 5, estoqueMinimo: 1,
})) }, ...Array.from({ length: 11 }, (_, i) => ({
  id: i + 2, nome: `Categoria ${i + 2}`, ordem: i + 1,
  produtos: [{ id: i + 24, nome: `Produto adicional ${i + 1}`, preco: 10, controlaEstoque: true, estoque: 5, estoqueMinimo: 1 }],
}))];
const sessoes = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1, mesa: i + 1, valorTotal: 150, valorPago: 0, valorRestante: 150,
  pagamentos: i === 0 ? Array.from({ length: 14 }, (_, j) => ({ id: j + 1, valor: 1, forma: 'pix' })) : [],
  pedidos: i === 0 ? Array.from({ length: 12 }, (_, j) => ({
    id: 100 + j, itens: Array.from({ length: j === 0 ? 15 : 1 }, (_, k) => ({
      id: 1000 + j * 100 + k, nome: `Item ${j}-${k}`, quantidade: 1, preco_unitario: 10, status: 'entregue',
    })),
  })) : [],
}));

async function main() {
  const browser = await chromium.launch({
    executablePath: await binary.executablePath(),
    args: [...binary.args.filter((a) => a !== '--single-process' && a !== '--no-zygote'), '--no-sandbox'],
    headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(() => { sessionStorage.setItem('pub-auth', JSON.stringify({ role: 'admin', nome: 'Admin' })); });
    await context.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      let body = [];
      if (p === '/api/me') body = { staff: { id: 1, papel: 'admin', nome: 'Admin', deveTrocarSenha: false }, csrfToken: 'teste' };
      else if (p === '/api/admin/cardapio' || p === '/api/cardapio') body = menu;
      else if (p === '/api/admin/dashboard') body = criarDashboard({ topProdutos: Array.from({ length: 8 }, (_, i) => ({ nome: `Mais vendido ${i + 1}`, quantidade: 8 - i })) });
      else if (p === '/api/admin/relatorio') body = relatorio;
      else if (p === '/api/caixa/sessoes') body = sessoes;
      else if (p === '/api/config/pix') body = { chave: '', nome: 'QR Admin', cidade: 'Itajaí' };
      else if (p.includes('event')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': teste\n\n' });
      return route.fulfill({ json: body });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/#/admin');
    const maisPedidos = page.getByRole('region', { name: 'Mais pedidos' });
    await maisPedidos.getByText('Mais vendido 1').waitFor();
    assert.equal(await maisPedidos.locator('li').count(), 5);
    await maisPedidos.getByRole('button', { name: 'Carregar mais' }).click();
    assert.equal(await maisPedidos.locator('li').count(), 8);
    await maisPedidos.getByRole('button', { name: 'Mostrar menos' }).click();
    assert.equal(await maisPedidos.locator('li').count(), 5);

    await page.goto(base + '/#/admin/funcoes');
    const estoque = page.getByRole('region', { name: 'Estoque' });
    await estoque.locator('button[aria-expanded]').nth(9).waitFor();
    assert.equal(await estoque.locator('button[aria-expanded]').count(), 10);
    await estoque.getByRole('button', { name: 'Carregar mais' }).click();
    assert.equal(await estoque.locator('button[aria-expanded]').count(), 12);
    await estoque.getByRole('button', { name: 'Mostrar menos' }).click();
    assert.equal(await estoque.locator('button[aria-expanded]').count(), 10);
    const grupo = page.locator('section').filter({ has: page.getByRole('button', { name: /^Categoria longa/ }) });
    await grupo.getByRole('button', { name: /^Categoria longa/ }).click();
    assert.equal(await grupo.getByRole('button', { name: '+ entrada' }).count(), 10);
    await grupo.getByRole('button', { name: 'Carregar mais' }).click();
    assert.equal(await grupo.getByRole('button', { name: '+ entrada' }).count(), 20);
    await grupo.getByRole('button', { name: 'Mostrar menos' }).click();
    assert.equal(await grupo.getByRole('button', { name: '+ entrada' }).count(), 10);

    await page.getByRole('button', { name: 'Relatório', exact: true }).click();
    const tabela = page.getByRole('region', { name: 'Contas fechadas do relatório' });
    await tabela.locator('tbody tr').nth(9).waitFor();
    for (const nome of ['Contas fechadas do relatório', 'Relatório por dia', 'Serviço por garçom']) {
      const secao = page.getByRole('region', { name: nome });
      assert.equal(await secao.locator('tbody tr').count(), 10, `${nome}: limite inicial`);
      await secao.getByRole('button', { name: 'Carregar mais' }).click();
      assert.equal(await secao.locator('tbody tr').count(), 20, `${nome}: próxima página`);
      await secao.getByRole('button', { name: 'Mostrar menos' }).click();
      assert.equal(await secao.locator('tbody tr').count(), 10, `${nome}: recolhe`);
    }
    const top = page.getByRole('region', { name: 'Top produtos do relatório' });
    assert.equal(await top.locator('li').count(), 5);
    await top.getByRole('button', { name: 'Carregar mais' }).click();
    assert.equal(await top.locator('li').count(), 8);
    await top.getByRole('button', { name: 'Mostrar menos' }).click();
    assert.equal(await top.locator('li').count(), 5);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV', exact: true }).click();
    const csv = fs.readFileSync(await (await download).path(), 'utf8');
    assert.equal(csv.trim().split('\n').length, 32, 'exportação usa todas as contas, não apenas as visíveis');
    assert.match(csv, /Cliente 31/);
    await tabela.getByText(/31 contas mais recentes de 35/).waitFor();
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'PDF / Imprimir' }).click();
    const pdf = await popup;
    await pdf.getByText('Cliente 31', { exact: true }).waitFor();
    await pdf.getByText('Garçom 25', { exact: true }).waitFor();
    await pdf.getByText(/apenas 31 de 35 contas do período/).waitFor();
    await pdf.close();
    console.log('  ✓ estoque e relatório expandem/recolhem sem truncar CSV/PDF');

    await page.goto(base + '/#/caixa');
    const abertas = page.getByRole('region', { name: 'Comandas abertas' });
    await abertas.locator('button[aria-pressed]').nth(9).waitFor();
    assert.equal(await abertas.locator('button[aria-pressed]').count(), 10);
    await abertas.getByRole('button', { name: 'Carregar mais' }).click();
    assert.equal(await abertas.locator('button[aria-pressed]').count(), 16);
    await abertas.getByRole('button', { name: 'Mostrar menos' }).click();
    assert.equal(await abertas.locator('button[aria-pressed]').count(), 10);
    const consumo = page.getByRole('region', { name: 'Consumo lançado' });
    const primeiroPedido = consumo.getByRole('group', { name: 'Pedido 100' });
    await primeiroPedido.getByText('Item 0-0').waitFor();
    assert.equal(await primeiroPedido.getByText('Item 0-10').count(), 0);
    await primeiroPedido.getByRole('button', { name: 'Carregar mais' }).click();
    await primeiroPedido.getByText('Item 0-14').waitFor();
    await primeiroPedido.getByRole('button', { name: 'Mostrar menos' }).click();
    assert.equal(await primeiroPedido.getByText('Item 0-10').count(), 0);
    assert.equal(await consumo.getByRole('group').count(), 10);
    await consumo.getByRole('button', { name: 'Carregar mais', exact: true }).last().click();
    assert.equal(await consumo.getByRole('group').count(), 12);
    const pagamentos = page.getByRole('region', { name: 'Pagamentos lançados' });
    await pagamentos.getByRole('button', { name: 'Carregar mais' }).click();
    await pagamentos.getByRole('button', { name: 'Mostrar menos' }).click();
    assert.deepEqual(errors, []);
    console.log('  ✓ comandas, pedidos, itens e pagamentos do Caixa são recolhíveis');
    await context.close();
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
