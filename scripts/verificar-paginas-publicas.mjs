#!/usr/bin/env node
/**
 * Smoke test das páginas públicas da apresentação.
 * Valida acesso direto, refresh e ausência de chamadas à API no guia estático.
 *
 * Uso:
 *   BASE_URL=http://127.0.0.1:3000 node scripts/verificar-paginas-publicas.mjs
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const host = new URL(BASE).hostname;
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(host)) {
  throw new Error("Teste bloqueado: BASE_URL precisa apontar para localhost/127.0.0.1.");
}

const packed = (await import("@sparticuz/chromium")).default;
process.env.LD_LIBRARY_PATH ||= "/tmp/al2023/lib";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || await packed.executablePath(),
  args: packed.args,
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const apiRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(BASE).origin && url.pathname.startsWith("/api/")) {
      apiRequests.push(request.url());
    }
  });

  for (const route of ["/apresentacao.html", "/guia-sistema.html"]) {
    const first = await page.goto(new URL(route, BASE).href, { waitUntil: "networkidle" });
    if (!first || first.status() !== 200) {
      throw new Error(`${route}: acesso direto falhou (${first?.status() ?? "sem resposta"}).`);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.reload({ waitUntil: "networkidle" });
    if (page.url() !== new URL(route, BASE).href) {
      throw new Error(`${route}: refresh não manteve a rota direta.`);
    }
    console.log("OK acesso direto + refresh", route);
  }

  if (apiRequests.length) {
    throw new Error("O guia/apresentação disparou chamadas à API:\\n" + apiRequests.join("\\n"));
  }
  console.log("OK zero requisições /api/ nas páginas públicas.");
} finally {
  await browser.close();
}
