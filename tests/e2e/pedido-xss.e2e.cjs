'use strict';

/**
 * XSS regression for the legacy order-tracking renderer.
 * Runs against an isolated HTTP fixture; no PostgreSQL or production API.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const payload = '</b><img src=x onerror="window.__xss=1">';
const pedido = {
  id: 123,
  table: 7,
  createdAt: new Date().toISOString(),
  total: 39.9,
  status: 'PENDING',
  items: [{
    qty: 1,
    name: payload,
    unitTotal: 39.9,
    meatPoint: null,
    additions: [{ name: payload }],
    removals: [payload],
    note: payload,
  }],
  note: payload,
};

async function main() {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/pedido/123') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(path.join(ROOT, 'public/pedido.html')));
      return;
    }
    if (pathname === '/js/safe-dom.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(fs.readFileSync(path.join(ROOT, 'public/js/safe-dom.js')));
      return;
    }
    if (pathname === '/api/orders/123') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(pedido));
      return;
    }
    if (/^\/(?:style\.css|style-ops\.css|theme-glass\.css)$/.test(pathname)) {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end('');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { chromium: pw } = require('playwright-core');
    const chromium = require('@sparticuz/chromium').default;
    browser = await pw.launch({
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, '--no-sandbox'],
      headless: true,
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    await page.goto(base + '/pedido/123', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app .order-line', { timeout: 10000 });

    const rendered = await page.locator('#app').innerText();
    assert.ok(rendered.includes(payload), 'payload deve aparecer como texto literal');
    assert.equal(await page.locator('#app img').count(), 0, 'payload não pode criar elemento img');
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'handler onerror não pode executar');
    assert.deepEqual(pageErrors, [], 'renderização não deve produzir erro JavaScript');

    console.log('✓ payload XSS em nome, adicional, removível e observações foi exibido como texto');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
