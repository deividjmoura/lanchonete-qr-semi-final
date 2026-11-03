'use strict';

/** Browser regression for the legacy removable-option inline-JS injection. */
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
    await page.setContent('<!doctype html><html><body><div id="modal"></div></body></html>');
    await page.addScriptTag({ path: path.join(root, 'public/js/mesa-app-b1.js') });

    const payload = "x\\');window.__xss=1;//";
    await page.evaluate((removal) => {
      window.produtos = [{
        id: 7,
        nome: 'Produto de teste',
        preco: 12,
        adicionais: [],
        removiveis: [removal],
      }];
      window.customizeDraft = {
        productId: 7,
        escolha: false,
        additions: [],
        removals: [],
        note: '',
        qty: 1,
      };
      window.esc = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      window.br = (value) => 'R$ ' + Number(value || 0).toFixed(2);
      renderCustomizeModal();
    }, payload);

    const input = page.locator('#modal input[data-rem-index="0"]');
    assert.equal(await input.count(), 1, 'opção removível deve ser renderizada');
    assert.equal(await input.getAttribute('onchange'), null, 'opção não pode conter handler inline');
    await input.check();

    assert.equal(await page.evaluate(() => window.__xss), undefined, 'payload não pode executar JavaScript');
    assert.equal(
      await page.evaluate(() => window.customizeDraft.removals[0]),
      payload,
      'listener deve preservar o valor original da opção',
    );
    assert.ok(
      (await page.locator('#modal').innerText()).includes(payload),
      'valor malicioso deve aparecer como texto escapado',
    );

    console.log('✓ removível com aspas e barra invertida não executa JavaScript');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
