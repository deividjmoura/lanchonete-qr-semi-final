const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/tmp/chromium', env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' }, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => console.log('[console.' + m.type() + ']', m.text().slice(0,300)));
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,300)));
  await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'networkidle' }).catch(e=>console.log('goto', e.message));
  await page.waitForTimeout(2000);
  console.log('root len:', await page.evaluate(() => document.getElementById('root')?.innerHTML.length));
  console.log('bodybg:', await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  console.log('theme:', await page.evaluate(() => document.documentElement.getAttribute('data-theme')));
  await browser.close();
})();
