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
async function checkViewport(page, width) {
  const original = await page.locator('.brand-mark').boundingBox();
  for (const height of [420, 320, 900]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      return { footer: rect('.login-page > footer'), logo: rect('.brand-mark'),
        card: rect('.login-card'), width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        bodyHeight: document.body.scrollHeight };
    });
    assert.ok(layout.footer.bottom <= height + 1 && layout.footer.top >= 0, 'rodapé visível com teclado');
    assert.equal(layout.logo.width, original.width, 'logo não encolhe em largura');
    assert.equal(layout.logo.height, original.height, 'logo não encolhe em altura');
    assert.ok(layout.logo.top >= 0 && layout.logo.bottom <= layout.footer.top, 'logo visível');
    assert.ok(layout.card.bottom <= layout.footer.top, 'formulário não cobre rodapé');
    assert.ok(layout.scrollWidth <= width + 1, 'sem rolagem horizontal');
    assert.ok(layout.scrollHeight <= height + 1 && layout.bodyHeight <= height + 1, 'sem rolagem vertical na página');
  }
  // Safari-style keyboard: layout viewport stays tall, visual viewport shrinks
  // and pans. This simulates viewport events, not a physical device keyboard.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 320 });
    Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 20 });
    visualViewport.dispatchEvent(new Event('resize'));
    visualViewport.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(100);
  const visible = await page.locator('.login-page > footer').boundingBox();
  assert.ok(visible.y >= 20 && visible.y + visible.height <= 341, 'rodapé acompanha visualViewport');
  const logo = await page.locator('.brand-mark').boundingBox();
  assert.equal(logo.width, original.width);
  assert.equal(logo.height, original.height);
  await page.evaluate(() => {
    delete visualViewport.height;
    delete visualViewport.offsetTop;
    visualViewport.dispatchEvent(new Event('resize'));
  });
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
      await checkViewport(page, width);
      await page.getByRole('button', { name: 'Entrar em Admin', exact: true }).click();
      await page.locator('#login-2fa').waitFor();
      await check(page, '#login-2fa');
      await checkViewport(page, width);
      await context.close();
    }
    console.log('✓ Senha/2FA: foco, logo e rodapé preservados, sem scroll de página; larguras 320/490/1440, alturas 320/420/900, temas claro/escuro e eventos visualViewport.');
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
