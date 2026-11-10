#!/usr/bin/env node
/**
 * Inspeção visual e funcional da landing oficial do QR Admin.
 *
 * Verifica, contra um servidor local:
 *  - a landing ocupa "/" (sem redirecionamento) e não tem overflow horizontal
 *    em 1440, 768, 390 e 320 px;
 *  - capturas reais do sistema carregam (nenhum placeholder);
 *  - links internos rolam a página sem trocar a rota;
 *  - /guia-sistema.html e /apresentacao.html continuam acessíveis;
 *  - todos os CTAs de acesso abrem o modal real de autenticação, com foco
 *    preso, ESC, clique fora e retorno de foco;
 *  - o formulário do modal usa a MESMA API de login do produto (#/login):
 *    credencial inválida mostra o erro real e 2FA pendente exibe a etapa 2.
 *
 * Uso:
 *   BASE_URL=http://127.0.0.1:8080 node scripts/verificar-landing.mjs [--screenshots]
 *
 * A API é interceptada apenas para simular respostas de autenticação; nenhuma
 * credencial real é usada e nenhum POST chega ao banco.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8080";
const host = new URL(BASE).hostname;
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(host)) {
  throw new Error("Teste bloqueado: BASE_URL precisa apontar para localhost/127.0.0.1.");
}
const screenshots = process.argv.includes("--screenshots");
const OUT = path.join(process.cwd(), "docs", "screenshots", "landing");

const packed = (await import("@sparticuz/chromium")).default;
process.env.LD_LIBRARY_PATH ||= "/tmp/al2023/lib";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (await packed.executablePath()),
  args: packed.args,
  headless: true,
});

const falhas = [];
const contextosExtras = [];
const ok = (msg) => console.log("OK  " + msg);
const falhar = (msg) => {
  falhas.push(msg);
  console.error("FALHA  " + msg);
};
const assert = (cond, msg) => (cond ? ok(msg) : falhar(msg));
/* AnimatePresence com mode="wait" troca o painel no quadro seguinte: esperar
   o texto evita ler o DOM no meio da transição. */
const esperarTexto = async (alvo, texto, timeout = 6000) => {
  const limite = Date.now() + timeout;
  while (Date.now() < limite) {
    const conteudo = await alvo.innerText().catch(() => "");
    /* `innerText` reflete o text-transform do CSS (rótulos em caixa alta). */
    if (conteudo.toLowerCase().includes(texto.toLowerCase())) return conteudo;
    await new Promise((r) => setTimeout(r, 120));
  }
  const final = await alvo.innerText().catch(() => "");
  throw new Error(`texto "${texto}" não apareceu; conteúdo atual: ${final.slice(0, 200)}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));

  /* --- 1. Rota "/" entrega a landing -------------------------------------- */
  const resp = await page.goto(BASE + "/", { waitUntil: "networkidle" });
  assert(resp?.status() === 200, "GET / responde 200");
  assert(page.url() === BASE + "/", "/ não redireciona");
  await page.locator("#hero-title").waitFor();
  assert(
    (await page.getByRole("heading", { level: 1 }).innerText()).includes("Quando o salão acelera"),
    "/ mostra o hero da landing aprovada",
  );
  await page.evaluate(() => document.fonts.ready);

  // [TRUNCATED FOR LENGTH - THIS IS A PROBLEM]
  console.log("INCOMPLETE - DO NOT USE");
} catch (e) {
  console.error(e);
  process.exit(1);
}
