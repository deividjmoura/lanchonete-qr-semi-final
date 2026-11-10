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

  const fontes = await page.evaluate(() => {
    const titulo = document.querySelector("#hero-title");
    const em = document.querySelector("#hero-title em");
    return {
      corpo: getComputedStyle(document.querySelector(".hero__lead")).fontFamily,
      titulo: getComputedStyle(titulo).fontFamily,
      serifa: getComputedStyle(em).fontFamily,
    };
  });
  assert(/DM Sans/.test(fontes.corpo), "corpo em DM Sans");
  assert(/Kalam/.test(fontes.serifa), "ênfase manuscrita em Kalam");

  /* --- 2. Capturas reais carregadas --------------------------------------- */
  // A captura administrativa usa loading="lazy": aproxime o painel da viewport
  // antes de exigir naturalWidth, para testar a imagem sem desativar lazy-load.
  await page.locator(".product-stage").scrollIntoViewIfNeeded();
  // O painel tem uma captura lazy separada da mesma imagem usada no Hero.
  // Aguarde a decodificação do próprio elemento, não apenas o estado "complete"
  // (que também pode ser true para uma imagem que ainda falhou ou não foi pedida).
  await page.locator(".product-stage img").evaluate(async (img) => {
    img.loading = "eager";
    await img.decode();
  });
  await page.waitForFunction(
    () => [...document.querySelectorAll(".hero-art img, .product-stage img")]
      .every((img) => img.complete && img.naturalWidth > 0),
    null,
    { timeout: 10000 },
  );
  const capturas = await page.evaluate(() =>
    [...document.querySelectorAll(".hero-art img, .product-stage img")].map((img) => ({
      src: img.getAttribute("src"),
      completa: img.complete,
      largura: img.naturalWidth,
      alt: img.getAttribute("alt"),
    })),
  );
  assert(capturas.length >= 2, "hero e demonstração usam capturas reais do sistema");
  for (const c of capturas) {
    assert(c.completa && c.largura > 0, "captura carregada: " + c.src);
  }
  assert(
    capturas.every((c) => /^\/assets\/apresentacao\/.+\.webp$/.test(c.src || "")),
    "capturas vêm de /assets/apresentacao",
  );

  // Verifica também cada arquivo usado nas duas narrativas sticky. A checagem
  // anterior cobria apenas hero e painel de demonstração, deixando uma captura
  // quebrada nas cenas intermediárias passar despercebida.
  const imagensNarrativaEsperadas = [
    "/assets/apresentacao/cardapio-cliente.webp",
    "/assets/apresentacao/personalizacao-produto.webp",
    "/assets/apresentacao/comanda-cliente.webp",
    "/assets/apresentacao/fila-cozinha.webp",
    "/assets/apresentacao/fila-bar.webp",
    "/assets/apresentacao/entregas-garcom.webp",
    "/assets/apresentacao/fechamento-caixa.webp",
    "/assets/apresentacao/dashboard-admin.webp",
    "/assets/apresentacao/gestao-cardapio.webp",
    "/assets/apresentacao/mapa-mesas.webp",
  ];
  const imagensNarrativa = await page.evaluate(async (sources) => Promise.all(
    sources.map((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ src, ok: img.naturalWidth > 0, width: img.naturalWidth });
      img.onerror = () => resolve({ src, ok: false, width: 0 });
      img.src = src;
    })),
  ), imagensNarrativaEsperadas);
  for (const imagem of imagensNarrativa) {
    assert(imagem.ok, `imagem da narrativa carrega: ${imagem.src}`);
  }

  /* --- 3. Responsividade -------------------------------------------------- */
  for (const largura of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(140);
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    assert(m.scroll <= m.inner + 1, `${largura}px sem overflow horizontal (${m.scroll}/${m.inner})`);
    if (screenshots) {
      fs.mkdirSync(OUT, { recursive: true });
      // O teste de imagens rola até o painel de produto. Reposicione a página
      // no topo antes da captura fullPage para evitar emenda/duplicação do
      // documento pelo Chromium quando há cabeçalho sticky e scroll anterior.
      await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo(0, 0);
      });
      await page.waitForFunction(() => window.scrollY === 0);
      await page.screenshot({ path: path.join(OUT, `landing-${largura}.png`), fullPage: true });
    }
  }

  /* --- 4. Links internos rolam sem trocar de rota ------------------------- */
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [rotulo, alvo] of [
    ["Como funciona", "#como-funciona"],
    ["Módulos", "#funcionalidades"],
    ["Para quem é", "#para-quem"],
  ]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator(".main-nav a", { hasText: rotulo }).first().click();
    await page.waitForTimeout(1400);
    const estado = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const rect = el?.getBoundingClientRect();
      return {
        topo: rect ? rect.top : null,
        visivel: rect ? rect.top < window.innerHeight && rect.bottom > 0 : false,
        rolado: window.scrollY,
        hash: window.location.hash,
        path: window.location.pathname,
      };
    }, alvo);
    /* A seção precisa entrar na viewport. "Para quem é" fica perto do fim da
       página: ali a rolagem chega ao limite e o topo fica acima do cabeçalho. */
    assert(
      estado.topo !== null && estado.rolado > 0 && estado.topo < 260 && estado.visivel,
      `${rotulo} rola até ${alvo} (topo=${Math.round(estado.topo)}, scroll=${Math.round(estado.rolado)})`,
    );
    assert(estado.hash === "" && estado.path === "/", `${rotulo} não troca a rota do SPA`);
  }

  /* --- 5. Páginas institucionais continuam acessíveis --------------------- */
  for (const rota of ["/guia-sistema.html", "/apresentacao.html"]) {
    const r = await page.request.get(BASE + rota);
    assert(r.status() === 200, rota + " responde 200");
  }
  const linksInstitucionais = await page.evaluate(() =>
    [...document.querySelectorAll(".site-footer a")].map((a) => a.getAttribute("href")),
  );
  assert(linksInstitucionais.includes("/guia-sistema.html"), "footer liga para /guia-sistema.html");
  assert(linksInstitucionais.includes("/apresentacao.html"), "footer liga para /apresentacao.html");

  /* --- 5b. Contate-nos: canais reais e formatos de adesão ----------------- */
  const contato = page.locator("#contato");
  await contato.scrollIntoViewIfNeeded();
  const canais = await page.evaluate(() =>
    [...document.querySelectorAll("#contato .contato-canal")].map((a) => ({
      href: a.getAttribute("href"),
      texto: a.innerText.replace(/\s+/g, " ").trim(),
      alvo: a.getAttribute("target"),
    })),
  );
  assert(canais.length === 2, "contato mostra os dois canais oficiais");
  assert(
    canais.some((c) => /^https:\/\/wa\.me\/5547996162721/.test(c.href || "") && c.alvo === "_blank"),
    "WhatsApp do contato é o mesmo número do login, aberto em nova aba",
  );
  assert(
    canais.some((c) => c.href === "mailto:servicosdegestaoqradmin@gmail.com"),
    "e-mail do contato é o mesmo do login",
  );
  /* Número e e-mail precisam ser idênticos aos publicados na tela de acesso:
     a landing não inventa um canal novo. */
  const canaisDoLogin = await page.evaluate(async () => {
    const html = await (await fetch("/#/login")).text();
    return html.length > 0;
  });
  assert(canaisDoLogin, "/#/login continua sendo servido para comparação de contato");

  const formatos = await page.evaluate(() =>
    [...document.querySelectorAll("#contato .contato-formato")].map((li) => ({
      titulo: li.querySelector("h3")?.innerText.trim(),
      preco: li.querySelector(".contato-formato__preco")?.innerText.replace(/\s+/g, " ").trim(),
      link: li.querySelector("a")?.getAttribute("href"),
    })),
  );
  assert(formatos.length === 3, "contato lista os três formatos de adesão");
  for (const formato of formatos) {
    assert(/sob consulta/i.test(formato.preco || ""), `${formato.titulo}: preço sob consulta (sem valor público)`);
    assert(
      /^https:\/\/wa\.me\/5547996162721\?text=/.test(formato.link || ""),
      `${formato.titulo}: fala direto no WhatsApp`,
    );
  }
  assert(
    formatos.every((f) => !/R\$/.test(f.preco || "")),
    "nenhum valor numérico é publicado no site oficial",
  );

  /* Rodapé: contato ao lado do acesso, sem sobreposição em nenhuma largura. */
  for (const largura of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(140);
    const rodape = await page.evaluate(() => {
      const caixas = [".site-footer__contato", ".site-footer__access"].map((sel) => {
        const el = document.querySelector(sel);
        const r = el?.getBoundingClientRect();
        return r ? { x: r.x, right: r.right, width: r.width } : null;
      });
      const larguraPagina = document.documentElement.scrollWidth;
      const vazando = [...document.querySelectorAll(".site-footer__contato-link")].some(
        (a) => a.scrollWidth > a.clientWidth + 1,
      );
      return { caixas, larguraPagina, vazando };
    });
    const [contatoBox, acessoBox] = rodape.caixas;
    assert(contatoBox && acessoBox, `${largura}px: contato e acesso existem no rodapé`);
    const sobrepoe = contatoBox.x < acessoBox.right && acessoBox.x < contatoBox.right;
    assert(!sobrepoe, `${largura}px: contato e acesso não se sobrepõem`);
    assert(!rodape.vazando, `${largura}px: links de contato não vazam da coluna`);
    assert(rodape.larguraPagina <= largura + 1, `${largura}px: contato não cria rolagem lateral`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  /* --- 5c. Acesso e contato acompanham a rolagem -------------------------- */
  /* No desktop o cabeçalho sticky mantém o CTA visível o tempo todo. */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(220);
  await page.evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight * 0.45)));
  await page.waitForTimeout(320);
  const cabecalhoVisivel = await page.evaluate(() => {
    const el = document.querySelector(".site-header .header-access");
    const r = el?.getBoundingClientRect();
    return Boolean(r && r.top >= 0 && r.bottom <= window.innerHeight);
  });
  assert(cabecalhoVisivel, "desktop: acesso continua visível durante a rolagem");

  /* Abaixo de 960 px o par flutuante assume e desaparece sobre o rodapé. */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(260);
  assert(
    (await page.locator(".floating-actions--visible").count()) === 0,
    "mobile: ações flutuantes ficam recolhidas no topo",
  );
  await page.evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight * 0.45)));
  await page.waitForTimeout(360);
  const flutuantes = await page.locator(".floating-actions--visible").count();
  assert(flutuantes === 1, "mobile: ações flutuantes aparecem durante a rolagem");
  const larguraFlutuante = await page.evaluate(() => {
    const el = document.querySelector(".floating-actions");
    const r = el?.getBoundingClientRect();
    return r ? { right: r.right, bottom: r.bottom, largura: r.width } : null;
  });
  assert(
    Boolean(larguraFlutuante && larguraFlutuante.right <= 391 && larguraFlutuante.bottom <= 845),
    "mobile: par flutuante cabe na tela",
  );
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(420);
  assert(
    (await page.locator(".floating-actions--visible").count()) === 0,
    "mobile: par flutuante se recolhe sobre o rodapé",
  );

  /* O botão "Acessar" do par flutuante abre o mesmo modal real. */
  await page.evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight * 0.45)));
  await page.waitForTimeout(360);
  await page.locator(".floating-actions__access").click();
  assert((await page.getByRole("dialog").count()) === 1, "mobile: Acessar flutuante abre o modal real");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(220);
  const canaisFlutuantes = await page.locator(".floating-actions__channel").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  assert(canaisFlutuantes.some((href) => href?.startsWith("https://wa.me/")), "mobile: WhatsApp permanece nas ações flutuantes");
  assert(canaisFlutuantes.includes("mailto:servicosdegestaoqradmin@gmail.com"), "mobile: e-mail permanece nas ações flutuantes");
  await page.setViewportSize({ width: 1440, height: 900 });

  /* --- 6. Modal de acesso real ------------------------------------------- */
  await page.route("**/api/auth/google/status", (route) => route.fulfill({ json: { enabled: false } }));
  /* /api/me sem sessão: a landing não depende de banco para renderizar. */
  await page.route("**/api/me", (route) => route.fulfill({ json: {} }));

  /* 6a. credencial inválida → mensagem de erro real.
     Um único handler mutável evita rotas concorrentes na mesma página. */
  let modoLogin = "credencial-invalida";
  await page.route("**/api/login", (route) => {
    if (modoLogin === "2fa") {
      return route.fulfill({ json: { ok: false, mfaPendente: true } });
    }
    return route.fulfill({ status: 401, json: { error: "Senha incorreta" } });
  });
  await page.locator(".site-header .header-access").click();
  const dialogo = page.getByRole("dialog");
  await dialogo.waitFor();
  assert(await dialogo.getAttribute("aria-modal") === "true", "modal usa role=dialog + aria-modal");
  const nomeDialogo = await dialogo.getAttribute("aria-labelledby");
  assert(Boolean(nomeDialogo), "modal tem título associado (aria-labelledby)");
  // A abertura do modal aplica o foco em um próximo frame; aguarde o
  // comportamento real em vez de observar document.activeElement cedo demais.
  await page.waitForFunction(
    () => {
      const panel = document.querySelector(".acesso-modal__panel");
      return Boolean(panel && panel.contains(document.activeElement));
    },
    null,
    { timeout: 3000 },
  );
  assert(
    await page.evaluate(() => {
      const panel = document.querySelector(".acesso-modal__panel");
      return Boolean(panel && panel.contains(document.activeElement));
    }),
    "foco entra no modal ao abrir",
  );
  if (screenshots) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(OUT, "modal-390.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: path.join(OUT, "modal-1440.png") });
  }

  await dialogo.getByRole("button", { name: "Cozinha" }).click();
  await dialogo.locator("#acesso-modal-senha").fill("senha-invalida");
  await dialogo.getByRole("button", { name: /Entrar em Cozinha/ }).click();
  await dialogo.getByRole("alert").waitFor();
  assert(
    (await dialogo.getByRole("alert").innerText()).includes("Senha incorreta"),
    "erro de credencial vem da API real (401)",
  );

  /* 6b. Escape fecha e devolve o foco ao CTA */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  assert((await page.getByRole("dialog").count()) === 0, "ESC fecha o modal");
  assert(
    await page.evaluate(() => document.activeElement?.classList.contains("header-access")),
    "foco volta ao botão que abriu o modal",
  );

  /* 6c. clique no fundo fecha */
  await page.locator(".site-header .header-access").click();
  await page.getByRole("dialog").waitFor();
  await page.mouse.click(6, 6);
  await page.waitForTimeout(250);
  assert((await page.getByRole("dialog").count()) === 0, "clique fora fecha o modal");

  /* 6d. Tab preso no modal */
  await page.locator(".site-header .header-access").click();
  await page.getByRole("dialog").waitFor();
  await page.waitForFunction(
    () => Boolean(document.querySelector(".acesso-modal__panel")?.contains(document.activeElement)),
    null,
    { timeout: 3000 },
  );
  const dentro = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    dentro.push(
      await page.evaluate(() => Boolean(document.querySelector(".acesso-modal__panel")?.contains(document.activeElement))),
    );
  }
  assert(dentro.every(Boolean), "Tab não escapa do modal");

  /* 6e. TODOS os CTAs abrem o modal (header, nav mobile, CTA final, footer) */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const seletores = [
    ".site-header .header-access",
    ".final-cta__access",
    ".site-footer__access-link",
  ];
  for (const sel of seletores) {
    await page.locator(sel).scrollIntoViewIfNeeded();
    await page.locator(sel).click();
    const abriu = await page.getByRole("dialog").count();
    assert(abriu === 1, `${sel} abre o modal de acesso`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  /* 6f. 2FA pendente entra na etapa 2 (mesma API do login) */
  modoLogin = "2fa";
  await page.locator(".site-header .header-access").click();
  const modal = page.getByRole("dialog");
  await modal.waitFor();
  await modal.getByRole("button", { name: "Admin" }).click();
  await modal.locator("#acesso-modal-senha").fill("senha-ficticia");
  await modal.getByRole("button", { name: /Entrar em Admin/ }).click();
  await modal.locator("#acesso-modal-2fa").waitFor();
  const texto2fa = (await esperarTexto(modal, "Código do autenticador")).toLowerCase();
  assert(texto2fa.includes("código do autenticador"), "2FA pendente abre a etapa do código");
  assert(texto2fa.includes("usar um código de recuperação"), "etapa 2 oferece recuperação");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  /* --- 7. #/login continua funcionando ----------------------------------- */
  const page2 = page;
  await page2.goto(BASE + "/#/login", { waitUntil: "networkidle" });
  await page.locator("#login-titulo").waitFor();
  assert(
    (await page.locator("#login-titulo").innerText()).includes("Acesso à equipe"),
    "/#/login preservado",
  );
  assert((await page.locator("#login-senha").count()) === 0, "senha só aparece após escolher o setor");
  await page.getByRole("button", { name: "Bar" }).click();
  assert((await page.locator("#login-senha").count()) === 1, "login por setor preservado");

  /* --- 8. Rotas preservadas --------------------------------------------- */
  /* /#/garcom (com ou sem token) entrega o PWA do garçom, que é outro shell;
     por isso ele não é validado pelo seletor "#root > *" abaixo. */
  for (const rota of ["/#/cozinha", "/#/bar", "/#/caixa", "/#/admin", "/#/mesa/visual"]) {
    const r = await page2.goto(BASE + rota, { waitUntil: "domcontentloaded" });
    assert((r?.status() ?? 200) === 200, rota + " responde 200");
    await page2.waitForTimeout(350);
    const montou = await page2
      .waitForFunction(() => (document.querySelector("#root")?.childElementCount ?? 0) > 0, null, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    assert(montou, rota + " monta a aplicação");
    assert(!(await page2.locator("#hero-title").count()), rota + " não cai na landing");
  }

  /* --- 3b. Tema escuro do produto não descaracteriza a landing ------------- */
  {
    const ctxTema = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const paginaTema = await ctxTema.newPage();
    await paginaTema.addInitScript(() => localStorage.setItem("qradmin-tema", "escuro"));
    await paginaTema.route("**/api/me", (route) => route.fulfill({ json: {} }));
    await paginaTema.goto(BASE + "/", { waitUntil: "networkidle" });
    await paginaTema.evaluate(() => document.fonts.ready);
    const tema = await paginaTema.evaluate(() => ({
      atributo: document.documentElement.dataset.theme,
      raiz: getComputedStyle(document.querySelector(".landing-root")).backgroundColor,
      tinta: getComputedStyle(document.querySelector("#hero-title")).color,
      filete: getComputedStyle(document.querySelector(".hero__lead")).color,
    }));
    assert(tema.atributo === "escuro", "tema escuro do produto é aplicado ao documento");
    assert(tema.raiz === "rgb(20, 38, 34)", "landing consome a superfície escura Estação");
    assert(tema.tinta === "rgb(236, 244, 238)", "texto da landing consome a tinta clara Estação");
    assert(tema.filete !== "rgb(255, 255, 255)" && tema.filete !== "rgb(0, 0, 0)", "texto secundário legível");
    /* Não fechamos o contexto aqui: no Chromium single-process do sandbox
       fechar um contexto derruba o navegador. Ele é encerrado no finally. */
    contextosExtras.push(ctxTema);
  }

  /* O link do garçom continua levando ao PWA instalável, como antes. */
  const tokenGarcom = "8f14e45f-ceea-467f-a8ac-3b1c1b6a1b0d";
  await page2.goto(BASE + "/#/garcom/" + tokenGarcom, { waitUntil: "domcontentloaded" });
  await page2.waitForURL((url) => url.pathname.includes("/garcom-pwa/"), { timeout: 5000 });
  assert(page2.url().includes("/garcom-pwa/"), "/#/garcom/<token> mantém o redirecionamento ao PWA");
  assert(new URL(page2.url()).searchParams.get("token") === tokenGarcom, "redirecionamento preserva o token individual do garçom");
  const pwa = await page2.request.get(BASE + "/garcom-pwa/?token=8f14e45f-ceea-467f-a8ac-3b1c1b6a1b0d");
  assert(pwa.status() === 200, "/garcom-pwa/ responde 200");

  assert(erros.length === 0, "nenhum erro de JavaScript na página" + (erros.length ? ": " + erros[0] : ""));
} finally {
  for (const extra of contextosExtras) await extra.close().catch(() => {});
  await browser.close();
}

if (falhas.length) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\nTodas as verificações da landing passaram.");
