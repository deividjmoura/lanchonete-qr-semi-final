'use strict';

/** Browser regression for stored XSS in the legacy admin product card. */
const assert = require('node:assert/strict');
const path = require('node:path');

async function main() {
  const { chromium: pw } = require('playwright-core');
  const chromium = require('@sparticuz/chromium').default;
  const root = path.join(__dirname, '..', '..');
  const browser = await pw.launch({
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, '--no-sandbox'],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page.addScriptTag({ path: path.join(root, 'public/js/admin-cardapio.js') });

    const payload = '<img src=x onerror="window.__xss=1">';
    await page.evaluate((removable) => {
      window.esc = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      window.br = (value) => 'R$ ' + Number(value || 0).toFixed(2);
      const html = renderProduto({
        id: 7,
        nome: 'Produto seguro',
        preco: 10,
        disponivel: true,
        controlaEstoque: false,
        estoque: null,
        estoqueMinimo: 0,
        setor: 'cozinha',
        descricao: '',
        adicionais: [],
        removiveis: [removable],
        fotoUrl: null,
      });
      document.getElementById('root').innerHTML = html;
    }, payload);

    assert.equal(await page.locator('#root img').count(), 0, 'removível não pode criar imagem/HTML');
    assert.ok((await page.locator('#root').innerText()).includes(payload), 'removível deve aparecer como texto');
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'handler do payload não pode executar');

    console.log('✓ removível malicioso no card do admin é renderizado como texto');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
