'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;
const base = process.env.VISUAL_BASE_URL;
if (!base) throw Error('VISUAL_BASE_URL ausente');
async function check(page, id) {
  const input = page.locator(id);
  await input.fill('1234567890123456789012345678901234567890');
  await input.focus();
  const style = await input.evaluate((el) => {
    const p = el.parentElement, a = el.getBoundingClientRect(), b = p.getBoundingClientRect();
    return { innerOutline: getComputedStyle(el).outlineStyle, outerOutline: getComputedStyle(p).outlineStyle,
      inside: a.x >= b.x && a.right <= b.right && a.y >= b.y && a.bottom <= b.bottom,
      page: document.documentElement.scrollWidth, width: innerWidth };
  });
  assert.equal(style.innerOutline, 'none', 'sem retângulo de foco dentro do campo');
  assert.equal(style.outerOutline, 'solid', 'foco acessível no conjunto ícone/campo');
  assert.ok(style.inside, 'input cabe no contêiner');
  assert.ok(style.page <= style.width + 1, 'sem overflow de página');
}
async function main() {
  const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter((a) => a !== '--single-process'), headless: true });
  try {
    for (const width of [320, 490, 1440]) for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce' });
      await context.route('**/api/**', (route) => route.fulfill({ json: route.request().url().endsWith('/api/login') ? { mfaPendente: true } : {} }));
      const page = await context.newPage();
      await page.goto(`${base}/#/login`);
      await page.getByRole('button', { name: 'Admin', exact: true }).click();
      await check(page, '#login-senha');
      await page.getByRole('button', { name: 'Entrar em Admin', exact: true }).click();
      await page.locator('#login-2fa').waitFor();
      await check(page, '#login-2fa');
      await context.close();
    }
    console.log('✓ Campos de senha e 2FA: foco único, contidos em 320/490/1440px, temas claro/escuro.');
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
