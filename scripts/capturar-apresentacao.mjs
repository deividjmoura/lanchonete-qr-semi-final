#!/usr/bin/env node
/**
 * Gera capturas reais da apresentação do QR Admin.
 *
 * Pré-requisitos:
 *   1. PostgreSQL de teste (ex.: npm run pg:local)
 *   2. .env com DATABASE_URL local + STAFF_SEED_PASSWORD
 *   3. npm run db:migrate && seed de demonstração
 *   4. Servidor rodando (npm run server ou start) em BASE_URL
 *   5. playwright-core + @sparticuz/chromium (ou Chrome local)
 *
 * Uso:
 *   BASE_URL=http://127.0.0.1:3000 node scripts/capturar-apresentacao.mjs
 *
 * Variáveis opcionais:
 *   OUT_DIR=public/assets/apresentacao
 *   ADMIN_USER=admin
 *   ADMIN_PASS=...   (senha pós-troca obrigatória do seed)
 *   MESA_TOKEN=...   (token de uma mesa do seed)
 *   GARCOM_TOKEN=...
 *
 * A navegação deve ir contra o backend real. Não interceptar /api/ para
 * devolver fixtures — isso invalida a captura para a apresentação.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium as playwrightChromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = path.resolve(ROOT, process.env.OUT_DIR || "public/assets/apresentacao");

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 };

function assertLocalBase(url) {
  const u = new URL(url);
  const hostsPermitidos = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!hostsPermitidos.has(u.hostname)) {
    throw new Error("Capturas bloqueadas: BASE_URL precisa apontar para localhost/127.0.0.1. Nunca capture usando produção.");
  }
}

async function launchBrowser() {
  try {
    const sparticuz = await import("@sparticuz/chromium");
    const executablePath = await sparticuz.default.executablePath();
    return playwrightChromium.launch({
      args: sparticuz.default.args,
      executablePath,
      headless: true,
    });
  } catch {
    return playwrightChromium.launch({
      channel: "chrome",
      headless: true,
    });
  }
}

async function settle(page, ms = 800) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page, name, { fullPage = false } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const png = path.join(OUT, `${name}.png`);
  const webp = path.join(OUT, `${name}.webp`);
  await page.screenshot({
    path: png,
    type: "png",
    fullPage,
    animations: "disabled",
  });
  try {
    const sharp = (await import("sharp")).default;
    await sharp(png).webp({ quality: 88 }).toFile(webp);
    fs.unlinkSync(png);
    console.log("ok", webp);
  } catch {
    console.warn("sharp indisponível; captura mantida em PNG:", png);
  }
}

async function loginStaff(page, user, pass) {
  await page.goto(`${BASE}/#/login`, { waitUntil: "domcontentloaded" });
  await settle(page, 500);
  // Ajuste os seletores conforme a UI real de Login.tsx
  const userSel = 'input[name="usuario"], input[name="login"], input[type="text"]';
  const passSel = 'input[name="senha"], input[type="password"]';
  await page.fill(userSel, user);
  await page.fill(passSel, pass);
  await page.click('button[type="submit"], button:has-text("Entrar")');
  await settle(page, 1000);
}

async function main() {
  assertLocalBase(BASE);
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS;
  const mesaToken = process.env.MESA_TOKEN;
  const garcomToken = process.env.GARCOM_TOKEN;

  if (!adminPass) {
    console.error("Defina ADMIN_PASS (senha do staff de teste após seed).");
    process.exit(1);
  }

  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: DESKTOP,
    locale: "pt-BR",
  });
  const page = await context.newPage();

  // --- Cliente ---
  if (mesaToken) {
    await page.goto(`${BASE}/#/mesa/${mesaToken}`, { waitUntil: "domcontentloaded" });
    await settle(page, 1200);
    await shot(page, "cardapio-cliente");
    // Abrir primeiro produto disponível (ajuste seletor)
    const produto = page.locator("[data-produto], .produto, button:has-text('Adicionar')").first();
    if (await produto.count()) {
      await produto.click();
      await settle(page, 600);
      await shot(page, "personalizacao-produto");
    }
    // Carrinho / comanda se houver botão
    const carrinho = page.locator("button:has-text('Carrinho'), button:has-text('Comanda'), [data-carrinho]").first();
    if (await carrinho.count()) {
      await carrinho.click();
      await settle(page, 600);
      await shot(page, "comanda-cliente");
    }
  } else {
    console.warn("MESA_TOKEN ausente — pulando capturas de cliente.");
  }

  // --- Staff ---
  await loginStaff(page, adminUser, adminPass);

  await page.goto(`${BASE}/#/admin/painel`, { waitUntil: "domcontentloaded" });
  await settle(page, 1500);
  await shot(page, "dashboard-admin");

  await page.goto(`${BASE}/#/admin/cardapio`, { waitUntil: "domcontentloaded" });
  await settle(page, 1000);
  await shot(page, "gestao-cardapio");

  await page.goto(`${BASE}/#/admin/mesas`, { waitUntil: "domcontentloaded" });
  await settle(page, 1000);
  await shot(page, "mapa-mesas");

  await page.goto(`${BASE}/#/cozinha`, { waitUntil: "domcontentloaded" });
  await settle(page, 1000);
  await shot(page, "fila-cozinha");

  await page.goto(`${BASE}/#/bar`, { waitUntil: "domcontentloaded" });
  await settle(page, 1000);
  await shot(page, "fila-bar");

  await page.goto(`${BASE}/#/caixa`, { waitUntil: "domcontentloaded" });
  await settle(page, 1000);
  await shot(page, "fechamento-caixa");

  if (garcomToken) {
    await page.goto(`${BASE}/#/garcom/${garcomToken}`, { waitUntil: "domcontentloaded" });
    await settle(page, 1000);
    await shot(page, "entregas-garcom");
  } else {
    console.warn("GARCOM_TOKEN ausente — pulando captura do garçom.");
  }

  await browser.close();
  console.log("Capturas em", OUT);
  console.log("Próximo passo: substituir .frame-placeholder em apresentacao.html e guia-sistema.html pelos <img>.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
