#!/usr/bin/env node
/**
 * Captura as telas reais do QR Admin em PostgreSQL isolado de demonstração.
 * Não intercepta nem substitui requisições /api/.
 *
 * Preparação (nunca usar com dados de produção):
 *   # Crie o banco local exclusivo qradmin_apresentacao_test e configure .env.
 *   npm run db:migrate
 *   DEMO_RESET_CONFIRM=APAGAR_qradmin_apresentacao_test npm run seed:apresentacao
 *   npm run server                 # http://127.0.0.1:8080
 *   node scripts/capturar-apresentacao.mjs
 *
 * O .env precisa apontar para PostgreSQL local qradmin_apresentacao_test e
 * conter DEMO_ADMIN_PASS. A captura consulta tokens fictícios diretamente
 * nesse banco; senhas e tokens não são impressos.
 *
 * Auditoria das páginas estáticas, sem regenerar capturas:
 *   node scripts/capturar-apresentacao.mjs --audit-only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import sharp from "sharp";
import { chromium as playwrightChromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env");
const OUT = path.join(ROOT, "public", "assets", "apresentacao");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const NOMES_IMAGENS = [
  "cardapio-cliente",
  "personalizacao-produto",
  "comanda-cliente",
  "dashboard-admin",
  "gestao-cardapio",
  "mapa-mesas",
  "fila-cozinha",
  "fila-bar",
  "entregas-garcom",
  "fechamento-caixa",
];
const segredos = new Set();

function carregarAmbienteLocal() {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(".env local ausente; configure apenas o PostgreSQL isolado de teste.");
  }

  const envArquivo = dotenv.parse(fs.readFileSync(ENV_FILE));
  const bancoDoShell = process.env.DATABASE_URL;
  for (const [nome, valor] of Object.entries(envArquivo)) {
    if (process.env[nome] === undefined) process.env[nome] = valor;
  }

  const ambiente = String(process.env.NODE_ENV || envArquivo.NODE_ENV || "development").toLowerCase();
  if (ambiente === "production") {
    throw new Error("NODE_ENV=production: captura recusada.");
  }

  const bancoDoArquivo = envArquivo.DATABASE_URL;
  const banco = String(process.env.DATABASE_URL || bancoDoArquivo || "").trim();
  const alvo = validarBancoLocal(banco);
  if (bancoDoShell && bancoDoArquivo) {
    const sobrescrito = validarBancoLocal(bancoDoShell);
    if (!mesmoBanco(alvo, sobrescrito)) {
      throw new Error("DATABASE_URL do processo difere do .env local; captura recusada.");
    }
  }

  // Carrega credenciais do arquivo sem imprimi-las nem sobrepor variáveis explícitas.
  for (const [nome, valor] of Object.entries(envArquivo)) {
    if (process.env[nome] === undefined) process.env[nome] = valor;
  }
  for (const chave of ["DEMO_ADMIN_PASS", "ADMIN_PASS"]) {
    if (process.env[chave]) segredos.add(String(process.env[chave]));
  }

  return { envArquivo, banco, alvo };
}

function validarBancoLocal(valor) {
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new Error("DATABASE_URL ausente ou inválida.");
  }
  if (!(["postgres:", "postgresql:"].includes(url.protocol))) {
    throw new Error("DATABASE_URL não é PostgreSQL.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  const banco = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const bancoDeTeste = banco === "qradmin_apresentacao_test";
  if (url.search) throw new Error("Parâmetros na URL do banco são recusados.");
  if (!local) throw new Error("Host do banco não é loopback; captura recusada.");
  if (!bancoDeTeste) throw new Error("O nome do banco não indica test/demo; captura recusada.");
  if (url.searchParams.has("sslmode") || /railway|neon\.tech|render\.com|supabase\.co/i.test(url.hostname)) {
    throw new Error("DATABASE_URL parece apontar a serviço remoto; captura recusada.");
  }
  return { url, host, banco };
}

function mesmoBanco(a, b) {
  const porta = (url) => url.port || "5432";
  return a.host === b.host && porta(a.url) === porta(b.url) && a.banco === b.banco;
}

function validarBaseLocal(valor) {
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new Error("BASE_URL inválida.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("BASE_URL precisa ser HTTP local (localhost/loopback); captura de produção recusada.");
  }
  if (url.username || url.password || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("BASE_URL deve ser uma origem local sem credenciais ou subcaminho.");
  }
  return url.origin;
}

async function buscarTokensDeTeste(connectionString) {
  const { Client } = pg;
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const { rows: identidade } = await client.query(
      "SELECT current_database() AS banco, inet_server_addr()::text AS endereco"
    );
    const endereco = String(identidade[0]?.endereco || "").split("/")[0].replace(/^::ffff:/, "");
    if (
      identidade[0]?.banco !== validarBancoLocal(connectionString).banco ||
      !["127.0.0.1", "::1"].includes(endereco)
    ) {
      throw new Error("A conexão efetiva não é o PostgreSQL local de teste esperado.");
    }

    const [{ rows: mesas }, { rows: garcons }] = await Promise.all([
      client.query("SELECT token FROM mesas WHERE numero = $1", [18]),
      client.query("SELECT token FROM garcons WHERE nome = $1 AND ativo = TRUE ORDER BY id LIMIT 1", ["Ana Ribeiro"]),
    ]);
    if (!mesas[0]?.token || !garcons[0]?.token) {
      throw new Error("Seed incompleto: mesa 18 ou conta de garçom fictícia não encontrada.");
    }
    segredos.add(String(mesas[0].token));
    segredos.add(String(garcons[0].token));
    return { mesaToken: String(mesas[0].token), garcomToken: String(garcons[0].token) };
  } finally {
    await client.end().catch(() => {});
  }
}

async function iniciarChromium() {
  // O pacote empacota as bibliotecas do Chromium; extraí-las torna a execução
  // reproduzível também fora do runtime AWS Lambda/AL2023.
  const { default: chromiumPacote, inflate } = await import("@sparticuz/chromium");
  const biblioteca = path.join(ROOT, "node_modules", "@sparticuz", "chromium", "bin", "al2023.tar.br");
  if (!fs.existsSync(biblioteca)) throw new Error("Bibliotecas locais do Chromium não encontradas.");
  await inflate(biblioteca);
  process.env.LD_LIBRARY_PATH = [
    "/tmp/al2023/lib",
    "/tmp/al2023/usr/lib",
    process.env.LD_LIBRARY_PATH,
  ].filter(Boolean).join(path.delimiter);
  const executablePath = await chromiumPacote.executablePath();
  return playwrightChromium.launch({
    args: chromiumPacote.args,
    executablePath,
    headless: true,
  });
}

function observarApiReal(page, origem) {
  const resumo = { requisicoes: 0, respostas: 0, sucesso: 0, mutacoes: 0, erros: [] };
  resumo.reiniciar = () => {
    resumo.requisicoes = 0;
    resumo.respostas = 0;
    resumo.sucesso = 0;
    resumo.mutacoes = 0;
    resumo.erros = [];
  };
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (url.origin !== origem || !url.pathname.startsWith("/api/")) return;
      resumo.requisicoes += 1;
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) resumo.mutacoes += 1;
    } catch {
      // Requisições que não são URLs HTTP não fazem parte desta auditoria.
    }
  });
  page.on("response", (response) => {
    try {
      const url = new URL(response.url());
      if (url.origin !== origem || !url.pathname.startsWith("/api/")) return;
      resumo.respostas += 1;
      if (response.status() >= 200 && response.status() < 300) resumo.sucesso += 1;
      else resumo.erros.push(response.status());
    } catch {
      // Ignora respostas sem URL HTTP.
    }
  });
  return resumo;
}

async function esperarVisual(page, pausa = 450) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    const visiveis = [...document.images].filter((imagem) => {
      const r = imagem.getBoundingClientRect();
      return r.bottom >= 0 && r.top <= innerHeight && r.right >= 0 && r.left <= innerWidth;
    });
    await Promise.all(visiveis.map((imagem) => imagem.decode().catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(pausa);
  await page.mouse.move(2, 2);
}

async function navegar(page, url, rotulo) {
  const destino = new URL(url);
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (response && response.status() >= 400) {
    throw new Error(`${rotulo}: resposta HTTP ${response.status()}.`);
  }
  // Navegações entre hashes da SPA são same-document e não têm resposta HTTP.
  if (!response) {
    const atual = new URL(page.url());
    if (atual.origin !== destino.origin || atual.pathname !== destino.pathname || atual.search !== destino.search || atual.hash !== destino.hash) {
      throw new Error(`${rotulo}: navegação interna não chegou à rota esperada.`);
    }
  }
}

async function salvarCaptura(page, nome, dimensoes) {
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  if (viewport.width !== dimensoes.width || viewport.height !== dimensoes.height) {
    throw new Error(`${nome}: viewport inesperado (${viewport.width}×${viewport.height}).`);
  }
  const png = await page.screenshot({
    type: "png",
    fullPage: false,
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  const destino = path.join(OUT, `${nome}.webp`);
  fs.mkdirSync(OUT, { recursive: true });
  const imagem = sharp(png);
  const metadata = await imagem.metadata();
  if (metadata.width !== dimensoes.width || metadata.height !== dimensoes.height) {
    throw new Error(`${nome}: dimensões de imagem inesperadas (${metadata.width}×${metadata.height}).`);
  }
  await sharp(png).webp({ quality: 89, effort: 6, smartSubsample: true }).toFile(destino);
  const arquivo = fs.statSync(destino);
  console.log(`Captura ${nome}.webp — ${metadata.width}×${metadata.height}, ${(arquivo.size / 1024).toFixed(0)} KiB`);
}

async function auditarPaginaEstatica(page, api, origem, caminho, esperadas, exigirHero) {
  api.reiniciar();
  const url = `${origem}${caminho}`;
  await navegar(page, url, caminho);
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
  await esperarVisual(page, 350);
  const titulo = await page.title();
  const imagens = await page.evaluate(() => [...document.querySelectorAll('.frame img[src*="/assets/apresentacao/"]')]
    .map((img) => ({
      src: img.getAttribute("src"),
      alt: img.getAttribute("alt"),
      width: img.getAttribute("width"),
      height: img.getAttribute("height"),
      loading: img.getAttribute("loading"),
      fetchpriority: img.getAttribute("fetchpriority"),
      frameClass: img.closest(".frame")?.className || "",
    })));
  if (imagens.length !== esperadas) {
    throw new Error(`${caminho}: esperadas ${esperadas} capturas no HTML, encontradas ${imagens.length}.`);
  }
  for (const img of imagens) {
    if (!img.src || !img.alt?.trim() || !Number(img.width) || !Number(img.height)) {
      throw new Error(`${caminho}: imagem sem src, alt descritivo ou dimensões reservadas.`);
    }
    const retrato = img.src.includes("entregas-garcom.webp");
    const dimensoes = retrato ? [390, 844] : [1440, 900];
    if (Number(img.width) !== dimensoes[0] || Number(img.height) !== dimensoes[1]) {
      throw new Error(`${caminho}: width/height não correspondem à captura ${img.src}.`);
    }
    const lcpHero = exigirHero && img.src.includes("cardapio-cliente.webp");
    if (lcpHero) {
      if (img.loading === "lazy" || img.fetchpriority !== "high") {
        throw new Error("Hero: cardapio-cliente.webp precisa ser eager e fetchpriority=high.");
      }
    } else if (img.loading !== "lazy") {
      throw new Error(`${caminho}: imagem abaixo da dobra precisa de loading=lazy.`);
    }
    if (retrato && !img.frameClass.split(/\s+/).includes("frame--portrait")) {
      throw new Error(`${caminho}: entregas-garcom.webp precisa do enquadramento vertical.`);
    }
  }
  const respostasImagens = await page.evaluate(async () => {
    const srcs = [...new Set([...document.querySelectorAll('.frame img[src*="/assets/apresentacao/"]')]
      .map((img) => img.src))];
    return Promise.all(srcs.map(async (src) => {
      try {
        const resposta = await fetch(src, { cache: "no-store" });
        return { status: resposta.status };
      } catch {
        return { status: 0 };
      }
    }));
  });
  if (respostasImagens.some((img) => img.status !== 200)) {
    throw new Error(`${caminho}: uma captura não respondeu HTTP 200.`);
  }

  let lcp = null;
  if (exigirHero) lcp = await page.evaluate(() => window.__qrApresentacaoLcp || null);
  const reload = await page.reload({ waitUntil: "domcontentloaded" });
  if (!reload || reload.status() >= 400) {
    throw new Error(`${caminho}: refresh retornou HTTP ${reload?.status() ?? "indisponível"}.`);
  }
  await esperarVisual(page, 200);
  if (api.requisicoes !== 0) {
    throw new Error(`${caminho}: página estática iniciou ${api.requisicoes} requisição(ões) /api/.`);
  }
  console.log(`Página estática ${caminho}: acesso direto + refresh HTTP 200; ${imagens.length} capturas carregáveis; /api/ = 0.`);
  if (lcp) console.log(`LCP local em ${caminho}: ${lcp.ms} ms (${lcp.tag || "elemento não identificado"}${lcp.id ? `#${lcp.id}` : ""}).`);
  return { caminho, titulo, imagens: imagens.length, api: api.requisicoes, lcp };
}

async function auditarPaginas(page, api, origem) {
  await page.setViewportSize(DESKTOP);
  await page.addInitScript(() => {
    window.__qrApresentacaoLcp = null;
    try {
      new PerformanceObserver((lista) => {
        const entrada = lista.getEntries().at(-1);
        if (!entrada) return;
        window.__qrApresentacaoLcp = {
          ms: Math.round(entrada.startTime),
          tag: entrada.element?.tagName || null,
          id: entrada.element?.id || null,
          classe: typeof entrada.element?.className === "string" ? entrada.element.className : null,
        };
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // LCP pode não estar disponível em alguns builds do Chromium.
    }
  });
  const apresentacao = await auditarPaginaEstatica(page, api, origem, "/apresentacao.html", 10, true);
  const guia = await auditarPaginaEstatica(page, api, origem, "/guia-sistema.html", 6, false);
  return { apresentacao, guia };
}

async function capturarAplicacao(page, api, origem, envArquivo, connectionString) {
  const { mesaToken } = await buscarTokensDeTeste(connectionString);
  const usuarioAdmin = process.env.ADMIN_USER || envArquivo.DEMO_ADMIN_USER || "admin";
  const senhaAdmin = process.env.ADMIN_PASS || envArquivo.DEMO_ADMIN_PASS;
  if (!senhaAdmin) throw new Error("Defina DEMO_ADMIN_PASS no .env local (mínimo conforme seed).");
  segredos.add(String(senhaAdmin));

  await page.setViewportSize(DESKTOP);
  page.setDefaultTimeout(18000);
  api.reiniciar();

    // Cliente: GETs reais do cardápio e da sessão; nenhuma chamada de envio.
    await navegar(page, `${origem}/#/mesa/${encodeURIComponent(mesaToken)}`, "Cardápio da mesa de teste");
    await page.getByRole("heading", { name: "Cardápio da casa", exact: true }).waitFor({ state: "visible" });
    const abrirXbacon = page.locator('.card-produto button[aria-label="Ver X-Bacon da Casa"]').first();
    await abrirXbacon.waitFor({ state: "visible" });
    await esperarVisual(page, 700);
    await salvarCaptura(page, "cardapio-cliente", DESKTOP);

    const mutacoesAntesDoCarrinho = api.mutacoes;
    await abrirXbacon.click();
    const modalProduto = page.getByRole("dialog").last();
    await modalProduto.waitFor({ state: "visible" });
    await modalProduto.getByRole("button", { name: /Cheddar extra/ }).click();
    await modalProduto.getByRole("button", { name: /sem cebola/i }).click();
    const observacaoProduto = modalProduto.getByPlaceholder("Observação para a cozinha (opcional)");
    await observacaoProduto.fill("Bem passado, maionese à parte.");
    await observacaoProduto.evaluate((elemento) => elemento.blur());
    await modalProduto.evaluate((elemento) => { elemento.scrollTop = elemento.scrollHeight; });
    await esperarVisual(page, 350);
    await salvarCaptura(page, "personalizacao-produto", DESKTOP);

    await modalProduto.getByRole("button", { name: /Adicionar ao pedido/ }).click();
    const comandaLateral = page.locator("aside").filter({ hasText: "Comanda atual" }).last();
    await comandaLateral.getByText("X-Bacon da Casa", { exact: true }).waitFor({ state: "visible" });
    const nomeCliente = comandaLateral.getByPlaceholder("Seu nome (para identificação na mesa)");
    if (await nomeCliente.count()) {
      await nomeCliente.fill("Luiza Martins");
      await nomeCliente.evaluate((elemento) => elemento.blur());
    }
    await esperarVisual(page, 350);
    if (api.mutacoes !== mutacoesAntesDoCarrinho) {
      throw new Error("Adicionar produto ao carrinho gerou uma mutação de API; captura cancelada.");
    }
    await salvarCaptura(page, "comanda-cliente", DESKTOP);

    // Equipe: autenticação real no servidor local, sem credenciais no log.
    await navegar(page, `${origem}/#/login`, "Login da equipe");
    await page.getByRole("heading", { name: "Acesso Equipe" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /^Admin/ }).click();
    await page.locator("#login-senha").fill(String(senhaAdmin));
    await page.getByRole("button", { name: /Entrar em Admin/ }).click();
    await page.waitForFunction(() => location.hash.includes("/admin"), null, { timeout: 18000 });

    await navegar(page, `${origem}/#/admin/painel`, "Dashboard administrativo");
    await page.locator(".dashboard-stage").waitFor({ state: "visible" });
    await page.waitForFunction(() => Boolean(document.querySelector(".card-neon .metric-value")) && !document.querySelector(".dash-error"), null, { timeout: 18000 });
    const semana = page.getByRole("button", { name: "Semana", exact: true });
    if (await semana.count()) {
      await semana.click();
      await page.waitForFunction(() => document.querySelector('.dashboard-period__group button[aria-pressed="true"]')?.textContent?.trim() === "Semana", null, { timeout: 10000 });
    }
    await esperarVisual(page, 650);
    await salvarCaptura(page, "dashboard-admin", DESKTOP);

    await navegar(page, `${origem}/#/admin/cardapio`, "Cardápio & Estoque");
    await page.getByRole("heading", { name: "Cardápio & Estoque", exact: true }).waitFor({ state: "visible" });
    const categoriaHamburgueres = page.locator("[data-category-id] button[data-drag-handle]").first();
    await categoriaHamburgueres.waitFor({ state: "visible" });
    await categoriaHamburgueres.click();
    await page.locator("[data-category-id] button[data-drag-handle][aria-expanded='true']").first().waitFor({ state: "visible" });
    await esperarVisual(page, 350);
    await salvarCaptura(page, "gestao-cardapio", DESKTOP);

    await navegar(page, `${origem}/#/admin/mesas`, "Mapa de mesas");
    await page.getByRole("button", { name: /Mapa e QR Codes/ }).click();
    await page.getByRole("heading", { name: "Mapa de mesas e QR Codes" }).waitFor({ state: "visible" });
    const pesquisaMesas = page.getByRole("textbox", { name: /Pesquisar uma ou mais mesas por número/ });
    await pesquisaMesas.fill("1,3,7,9,12,16,18");
    await page.getByText(/7 mesas encontradas/).waitFor({ state: "visible" });
    await pesquisaMesas.evaluate((elemento) => elemento.blur());
    await esperarVisual(page, 400);
    await salvarCaptura(page, "mapa-mesas", DESKTOP);

    await navegar(page, `${origem}/#/cozinha`, "Fila da cozinha");
    await page.getByRole("heading", { name: "Fila da chapa", exact: true }).waitFor({ state: "visible" });
    await abrirEtapasFila(page);
    await esperarVisual(page, 350);
    await salvarCaptura(page, "fila-cozinha", DESKTOP);

    await navegar(page, `${origem}/#/bar`, "Fila do bar");
    await page.getByRole("heading", { name: "Fila do balcão", exact: true }).waitFor({ state: "visible" });
    await abrirEtapasFila(page);
    await esperarVisual(page, 350);
    await salvarCaptura(page, "fila-bar", DESKTOP);

    await navegar(page, `${origem}/#/caixa`, "Fechamento de contas");
    await page.getByRole("heading", { name: "Fechamento de contas", exact: true }).waitFor({ state: "visible" });
    const listaComandas = page.locator('section[aria-label="Comandas abertas"]');
    await listaComandas.getByRole("button", { name: /Mesa 09/ }).click();
    await listaComandas.locator('button[aria-pressed="true"]').waitFor({ state: "visible" });
    await esperarVisual(page, 350);
    await salvarCaptura(page, "fechamento-caixa", DESKTOP);

    if (api.sucesso < 8) throw new Error("Poucas respostas /api/ reais: backend local não foi validado para as capturas.");
    console.log(`Backend real: ${api.requisicoes} requisições /api/, ${api.sucesso} respostas 2xx; nenhuma rota Playwright foi interceptada.`);
    return { api: api.requisicoes, apiSucesso: api.sucesso };
}

async function abrirEtapasFila(page) {
  for (const etapa of ["em_producao", "na_fila"]) {
    const botao = page.locator(`section[data-etapa="${etapa}"] button.ops-sessao__toggle`);
    await botao.waitFor({ state: "visible" });
    if ((await botao.getAttribute("aria-expanded")) !== "true") await botao.click();
    await page.locator(`section[data-etapa="${etapa}"] .ops-card`).first().waitFor({ state: "visible" });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function capturarEntregasGarcom(page, api, origem, connectionString) {
  const { garcomToken } = await buscarTokensDeTeste(connectionString);
  await page.setViewportSize(MOBILE);
  page.setDefaultTimeout(18000);
  api.reiniciar();
    const url = `${origem}/garcom-pwa/?token=${encodeURIComponent(garcomToken)}`;
    await navegar(page, url, "PWA do garçom");
    await page.waitForFunction(() => document.querySelector("#identity")?.textContent?.includes("Garçom"), null, { timeout: 18000 });
    await page.waitForFunction(() => document.querySelector("#offlineNotice")?.hidden !== false, null, { timeout: 10000 });
    if (new URL(page.url()).searchParams.has("token")) {
      throw new Error("O PWA não removeu o token da URL antes da captura.");
    }
    const abaEntregas = page.locator('button[data-tab="deliveries"]');
    await abaEntregas.click();
    await page.locator("#readyOrders article.order").first().waitFor({ state: "visible" });
    const primeiroPedido = page.locator("#readyOrders article.order").first();
    const resumo = primeiroPedido.locator(".order-summary");
    await page.evaluate(() => window.scrollTo(0, 0));
    await esperarVisual(page, 350);
    if ((await resumo.getAttribute("aria-expanded")) !== "true") await resumo.click();
    const corpoPedido = primeiroPedido.locator(".order-body");
    await corpoPedido.waitFor({ state: "visible" });
    await resumo.evaluate((elemento) => elemento.blur());
    await page.waitForTimeout(100);
    if ((await resumo.getAttribute("aria-expanded")) !== "true" || await corpoPedido.getAttribute("hidden") !== null) {
      throw new Error("Não foi possível manter o pedido de entrega expandido na captura.");
    }
    await salvarCaptura(page, "entregas-garcom", MOBILE);
    if (api.sucesso < 2) throw new Error("O PWA não recebeu dados reais da API local.");
    console.log(`PWA real: ${api.requisicoes} requisições /api/, ${api.sucesso} respostas 2xx; viewport 390×844; token ausente da URL final.`);
    return { api: api.requisicoes, apiSucesso: api.sucesso };
}

async function principal() {
  const { envArquivo, banco } = process.argv.includes("--audit-only")
    ? { envArquivo: {}, banco: null }
    : carregarAmbienteLocal();
  const origem = validarBaseLocal(process.env.BASE_URL || "http://127.0.0.1:8080");
  const browser = await iniciarChromium();
  let context;
  try {
    context = await browser.newContext({
      viewport: DESKTOP,
      deviceScaleFactor: 1,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(18000);
    const api = observarApiReal(page, origem);

    if (process.argv.includes("--audit-only")) {
      await auditarPaginas(page, api, origem);
      return;
    }
    const app = await capturarAplicacao(page, api, origem, envArquivo, banco);
    const garcom = await capturarEntregasGarcom(page, api, origem, banco);
    const paginas = await auditarPaginas(page, api, origem);
    const ausentes = NOMES_IMAGENS.filter((nome) => !fs.existsSync(path.join(OUT, `${nome}.webp`)));
    if (ausentes.length) throw new Error(`Capturas ausentes: ${ausentes.join(", ")}.`);
    console.log(`Concluído: 10 capturas WebP em ${path.relative(ROOT, OUT)}.`);
    console.log(`Resumo de API real: SPA=${app.apiSucesso} respostas 2xx; PWA=${garcom.apiSucesso}; guia=${paginas.guia.api}.`);
  } finally {
    await context?.close().catch(() => {});
    await browser.close();
  }
}
function mensagemSegura(erro) {
  let texto = erro?.stack || erro?.message || String(erro);
  for (const segredo of segredos) {
    if (segredo) texto = texto.split(segredo).join("[redigido]");
  }
  return texto;
}

const executadoDireto = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (executadoDireto) {
  principal().catch((erro) => {
    console.error(mensagemSegura(erro));
    process.exitCode = 1;
  });
}
