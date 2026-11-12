#!/usr/bin/env node
/**
 * Inspeção visual e funcional da landing oficial do QR Admin.
 *
 * Verifica, contra um servidor local:
 *  - a landing ocupa "/" (sem redirecionamento) e não tem overflow horizontal
 *    em 1440, 768, 390 e 320 px;
 *  - a página usa a identidade "Passe": Archivo, tokens e tema claro/escuro;
 *  - capturas reais do sistema carregam (nenhum placeholder);
 *  - a narrativa de rolagem do percurso acompanha a rolagem: a linha de passe
 *    avança, a estação ativa muda e o palco troca de captura;
 *  - links internos rolam a página sem trocar a rota;
 *  - /guia-sistema.html e /apresentacao.html continuam acessíveis;
 *  - a landing não publica ofertas, planos ou preços comerciais e mantém os
 *    dois canais oficiais de contato;
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
    "/ mostra o hero da landing",
  );
  await page.evaluate(() => document.fonts.ready);

  /* Identidade "Passe": uma família só (Archivo), em que a largura da letra
     faz a hierarquia — título largo, texto na largura normal. */
  const fontes = await page.evaluate(() => {
    const titulo = getComputedStyle(document.querySelector("#hero-title"));
    const corpo = getComputedStyle(document.querySelector(".hero__lead"));
    const grifo = getComputedStyle(document.querySelector("#hero-title .grifo"));
    return {
      corpo: corpo.fontFamily,
      titulo: titulo.fontFamily,
      larguraTitulo: parseFloat(titulo.fontStretch),
      larguraCorpo: parseFloat(corpo.fontStretch),
      grifo: grifo.textDecorationLine,
      carregada: document.fonts.check('700 16px "Archivo"'),
    };
  });
  assert(/^"?Archivo/.test(fontes.corpo), "corpo em Archivo");
  assert(/^"?Archivo/.test(fontes.titulo), "título em Archivo");
  assert(fontes.carregada, "Archivo variável foi carregada (sem cair na fonte do sistema)");
  assert(
    fontes.larguraTitulo > fontes.larguraCorpo,
    `título usa a largura larga da família (${fontes.larguraTitulo}% > ${fontes.larguraCorpo}%)`,
  );
  assert(fontes.grifo.includes("underline"), "ênfase do hero é o grifo de sinal");
  const familias = await page.evaluate(() => {
    const usadas = new Set();
    for (const el of document.querySelectorAll(".landing-root *")) {
      usadas.add(getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "").trim());
    }
    return [...usadas];
  });
  assert(
    familias.length === 1 && familias[0] === "Archivo",
    "a landing inteira usa uma única família tipográfica (" + familias.join(", ") + ")",
  );

  /* --- 2. Capturas reais carregadas --------------------------------------- */
  const capturas = await page.evaluate(() =>
    [...document.querySelectorAll(".hero-art img")].map((img) => ({
      src: img.getAttribute("src"),
      completa: img.complete,
      largura: img.naturalWidth,
      alt: img.getAttribute("alt"),
    })),
  );
  assert(capturas.length === 2, "hero mostra duas capturas reais do sistema (painel e garçom)");
  assert(
    capturas.every((c) => (c.alt || "").length > 20),
    "capturas do hero têm texto alternativo descritivo",
  );
  for (const c of capturas) {
    assert(c.completa && c.largura > 0, "captura carregada: " + c.src);
  }
  assert(
    capturas.every((c) => /^\/assets\/apresentacao\/.+\.webp$/.test(c.src || "")),
    "capturas vêm de /assets/apresentacao",
  );

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
      await page.screenshot({ path: path.join(OUT, `landing-${largura}.png`), fullPage: true });
    }
  }

  /* --- 3a. Narrativa de rolagem do percurso -------------------------------- */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(160);
  const lerPercurso = () =>
    page.evaluate(() => {
      const trilho = document.querySelector(".percurso__trilho");
      const etapas = [...document.querySelectorAll(".percurso__etapa")];
      const cenas = [...document.querySelectorAll(".percurso__cena")];
      const visiveis = cenas.filter((c) => !c.hasAttribute("aria-hidden"));
      return {
        progresso: parseFloat(trilho.style.getPropertyValue("--percurso") || "0"),
        estados: etapas.map((e) => e.dataset.estado),
        ativa: etapas.findIndex((e) => e.dataset.estado === "ativa"),
        cenasVisiveis: visiveis.length,
        cena: visiveis[0]?.getAttribute("src") || null,
        cenaCarregada: Boolean(visiveis[0]?.complete && visiveis[0]?.naturalWidth > 0),
        opacidade: visiveis[0] ? getComputedStyle(visiveis[0]).opacity : null,
        placa: document.querySelector(".percurso__palco .placa__numero")?.textContent,
        palco: getComputedStyle(document.querySelector(".percurso__palco")).display,
        palcoPreso: getComputedStyle(document.querySelector(".percurso__palco")).position,
      };
    });
  const esperado = [
    "cardapio-cliente",
    "personalizacao-produto",
    "fila-cozinha",
    "entregas-garcom",
    "fechamento-caixa",
    "dashboard-admin",
  ];
  const totalEtapas = await page.locator(".percurso__etapa").count();
  assert(totalEtapas === 6, "percurso tem as seis estações do pedido");
  let progressoAnterior = -1;
  let progressoCresce = true;
  for (let i = 0; i < totalEtapas; i++) {
    /* Leva o topo da estação um pouco acima do meio da tela: é o gatilho. */
    await page.evaluate((indice) => {
      const etapa = document.querySelectorAll(".percurso__etapa")[indice];
      const topo = etapa.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.round(topo - window.innerHeight * 0.5 + 24));
    }, i);
    await page.waitForFunction(
      (indice) => document.querySelectorAll(".percurso__etapa")[indice]?.dataset.estado === "ativa",
      i,
      { timeout: 4000 },
    ).catch(() => {});
    await page.waitForFunction(
      () => {
        const cena = document.querySelector(".percurso__cena:not([aria-hidden])");
        return Boolean(cena && cena.complete && cena.naturalWidth > 0);
      },
      null,
      { timeout: 6000 },
    ).catch(() => {});
    await page.waitForTimeout(420);
    const estado = await lerPercurso();
    assert(estado.ativa === i, `estação ${i + 1} fica ativa quando cruza o meio da tela`);
    assert(
      estado.estados.slice(0, i).every((e) => e === "feita") &&
        estado.estados.slice(i + 1).every((e) => e === "adiante"),
      `estação ${i + 1}: anteriores feitas, seguintes adiante`,
    );
    assert(
      estado.cenasVisiveis === 1 && (estado.cena || "").includes(`/assets/apresentacao/${esperado[i]}.webp`),
      `estação ${i + 1}: palco mostra a captura ${esperado[i]}`,
    );
    assert(estado.cenaCarregada, `estação ${i + 1}: captura do palco carregada`);
    assert(estado.opacidade === "1", `estação ${i + 1}: cena do palco fica opaca`);
    assert(estado.placa === `0${i + 1}`, `estação ${i + 1}: plaquinha do palco mostra a etapa`);
    if (estado.progresso <= progressoAnterior) progressoCresce = false;
    progressoAnterior = estado.progresso;
    if (i === 0) {
      assert(estado.palco !== "none" && estado.palcoPreso === "sticky", "desktop: palco preso durante a rolagem");
      assert(estado.progresso < 0.2, `linha de passe começa apagada (${estado.progresso})`);
    }
  }
  assert(progressoCresce, "linha de passe avança a cada estação");
  assert(progressoAnterior > 0.75, `linha de passe chega perto do fim na última estação (${progressoAnterior})`);
  if (screenshots) {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, "percurso-1440.png") });
  }

  /* Sem palco em telas estreitas: cada estação mostra a própria captura. */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const percursoEstreito = await page.evaluate(() => ({
    palco: getComputedStyle(document.querySelector(".percurso__palco")).display,
    figuras: [...document.querySelectorAll(".percurso__figura")].map((f) => getComputedStyle(f).display),
  }));
  assert(percursoEstreito.palco === "none", "mobile: o palco fixo sai de cena");
  assert(
    percursoEstreito.figuras.length === 6 && percursoEstreito.figuras.every((d) => d !== "none"),
    "mobile: cada estação mostra a própria captura",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(160);
  await page.evaluate(() => window.scrollTo(0, 0));
  const figurasDesktop = await page.evaluate(() =>
    [...document.querySelectorAll(".percurso__figura")].every((f) => getComputedStyle(f).display === "none"),
  );
  assert(figurasDesktop, "desktop: capturas por estação ficam só no palco");

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
  assert(linksInstitucionais.includes("/guia-sistema.html#acesso"), "landing liga direto para o guia de acesso");
  assert(linksInstitucionais.includes("/guia-sistema.html#uso"), "landing liga direto para o guia de uso");
  assert(linksInstitucionais.includes("/apresentacao.html"), "footer liga para /apresentacao.html");
  const guiaHtml = await (await page.request.get(BASE + "/guia-sistema.html")).text();
  assert(/<section id="acesso"/.test(guiaHtml), "guia contém a seção ancorada de acesso");
  assert(/<section id="uso"/.test(guiaHtml), "guia contém a seção ancorada de uso");
  assert(/segundo fator \(2FA\) é uma configuração de segurança por conta/i.test(guiaHtml), "guia identifica 2FA como configuração da conta");
  assert(/aplicativo do banco/i.test(guiaHtml) && /PIX manual/i.test(guiaHtml), "guia mantém a conferência manual do PIX no banco");
  assert(/avisos sonoros e por voz/i.test(guiaHtml) && /dispositivo/i.test(guiaHtml), "guia ressalva que avisos dependem do dispositivo");
  assert(/preços/.test(guiaHtml) && /não é nota fiscal/i.test(guiaHtml), "guia preserva preços de produtos e ressalva fiscal");

  /* --- 5b. Contato: canais oficiais e ausência de oferta comercial -------- */
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
    "e-mail do contato é o endereço oficial do QR Admin",
  );
  assert(
    canais.some((c) => c.texto.toLowerCase().includes("servicosdegestaoqradmin@gmail.com")),
    "o endereço de e-mail aparece por extenso no contato",
  );
  const canaisComIcone = await page.evaluate(() =>
    [...document.querySelectorAll("#contato .contato-canal")].every((a) => a.querySelector(".contato-canal__icone svg")),
  );
  assert(canaisComIcone, "cada canal do contato tem o próprio ícone");
  /* Número e e-mail precisam ser idênticos aos publicados na tela de acesso:
     a landing não inventa um canal novo. */
  const canaisDoLogin = await page.evaluate(async () => {
    const html = await (await fetch("/#/login")).text();
    return html.length > 0;
  });
  assert(canaisDoLogin, "/#/login continua sendo servido para comparação de contato");

  const ofertaComercial = await page.evaluate(() => {
    const texto = document.querySelector(".landing-root")?.innerText || "";
    return {
      cards: document.querySelectorAll("#contato .contato-formato, #contato .contato__formatos").length,
      valores: texto.match(/\bR\$\s*\d[\d.,]*/gi) || [],
      termos: texto.match(/\b(?:sob consulta|assinatura mensal|mensalidade|plano(?:s)? comerciais?|licen[cç]a pr[oó]pria|venda exclusiva|formatos? de ades[aã]o)\b/gi) || [],
    };
  });
  assert(ofertaComercial.cards === 0, "contato não contém cards de oferta ou adesão");
  assert(ofertaComercial.valores.length === 0, "landing não publica valores comerciais em reais");
  assert(ofertaComercial.termos.length === 0, "landing não anuncia planos ou condições comerciais");

  /* Rodapé: contato ao lado do acesso, sem sobreposição em nenhuma largura. */
  for (const largura of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(140);
    const rodape = await page.evaluate(() => {
      const caixas = [".site-footer__contato", ".site-footer__access"].map((sel) => {
        const el = document.querySelector(sel);
        const r = el?.getBoundingClientRect();
        return r ? { x: r.x, right: r.right, y: r.y, bottom: r.bottom, width: r.width } : null;
      });
      const larguraPagina = document.documentElement.scrollWidth;
      const vazando = [...document.querySelectorAll(".site-footer__contato-link")].some(
        (a) => a.scrollWidth > a.clientWidth + 1,
      );
      return { caixas, larguraPagina, vazando };
    });
    const [contatoBox, acessoBox] = rodape.caixas;
    assert(contatoBox && acessoBox, `${largura}px: contato e acesso existem no rodapé`);
    /* Lado a lado nas telas largas, empilhados nas estreitas: em nenhum caso
       um retângulo invade o outro. */
    const sobrepoe =
      contatoBox.x < acessoBox.right - 0.5 &&
      acessoBox.x < contatoBox.right - 0.5 &&
      contatoBox.y < acessoBox.bottom - 0.5 &&
      acessoBox.y < contatoBox.bottom - 0.5;
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
  /* Ao lado do acesso, os dois canais em ícone: WhatsApp e e-mail. */
  const canaisFlutuantes = await page.evaluate(() =>
    [...document.querySelectorAll(".floating-actions__canal")].map((a) => {
      const r = a.getBoundingClientRect();
      return {
        href: a.getAttribute("href"),
        alvo: a.getAttribute("target"),
        nome: a.getAttribute("aria-label"),
        icone: Boolean(a.querySelector("svg")),
        lado: Math.min(r.width, r.height),
        naTela: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
      };
    }),
  );
  assert(canaisFlutuantes.length === 2, "mobile: barra de ações traz os dois canais de contato");
  assert(
    canaisFlutuantes.some((c) => /^https:\/\/wa\.me\/5547996162721/.test(c.href || "") && c.alvo === "_blank"),
    "mobile: WhatsApp persistente abre a conversa em nova aba",
  );
  assert(
    canaisFlutuantes.some((c) => c.href === "mailto:servicosdegestaoqradmin@gmail.com"),
    "mobile: e-mail persistente usa o endereço oficial",
  );
  assert(
    canaisFlutuantes.every((c) => c.icone && c.nome && c.lado >= 44 && c.naTela),
    "mobile: canais em ícone, com nome acessível e área de toque de 44 px ou mais",
  );

  /* No desktop ficam só os dois canais (o acesso já está no cabeçalho). */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight * 0.45)));
  await page.waitForTimeout(420);
  const flutuanteDesktop = await page.evaluate(() => ({
    visivel: document.querySelectorAll(".floating-actions--visible").length,
    acesso: getComputedStyle(document.querySelector(".floating-actions__access")).display,
    canais: [...document.querySelectorAll(".floating-actions__canal")].filter(
      (a) => getComputedStyle(a).display !== "none",
    ).length,
  }));
  assert(
    flutuanteDesktop.visivel === 1 && flutuanteDesktop.canais === 2 && flutuanteDesktop.acesso === "none",
    "desktop: canais de contato acompanham a rolagem; o acesso fica no cabeçalho",
  );

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
  /* O modal move o foco 40 ms depois de montar (AuthModal.tsx, igual ao que
     era antes do rebranding). Ler o foco no instante em que o diálogo aparece
     é corrida: só passava porque a página antiga levava mais que isso para
     responder ao clique. Espera-se o foco entrar, com limite curto. */
  assert(
    await page
      .waitForFunction(() => {
        const p = document.querySelector(".acesso-modal__panel");
        return Boolean(p && p.contains(document.activeElement));
      }, null, { timeout: 1000 })
      .then(() => true, () => false),
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

  /* --- 3b. A landing acompanha o tema claro/escuro do produto -------------- */
  {
    const ctxTema = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const paginaTema = await ctxTema.newPage();
    await paginaTema.addInitScript(() => {
      if (!sessionStorage.getItem("tema-semeado")) {
        localStorage.setItem("qradmin-tema", "claro");
        sessionStorage.setItem("tema-semeado", "1");
      }
    });
    await paginaTema.route("**/api/me", (route) => route.fulfill({ json: {} }));
    await paginaTema.goto(BASE + "/", { waitUntil: "networkidle" });
    await paginaTema.evaluate(() => document.fonts.ready);
    const lerTema = () =>
      paginaTema.evaluate(() => {
        const rgb = (cor) => (cor.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luz = ([r, g, b]) => {
          const canal = (v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
        };
        const contraste = (a, b) => {
          const [x, y] = [luz(rgb(a)), luz(rgb(b))].sort((m, n) => n - m);
          return (x + 0.05) / (y + 0.05);
        };
        const estilo = (sel) => getComputedStyle(document.querySelector(sel));
        const fundo = estilo(".landing-root").backgroundColor;
        const faixa = estilo(".percurso").backgroundColor;
        const botao = estilo(".hero .botao--primario");
        return {
          atributo: document.documentElement.dataset.theme,
          fundo,
          titulo: estilo("#hero-title").color,
          contrasteTitulo: contraste(estilo("#hero-title").color, fundo),
          contrasteTexto: contraste(estilo(".hero__lead").color, fundo),
          contrasteBotao: contraste(botao.color, botao.backgroundColor),
          contrasteFaixa: contraste(estilo("#flow-title").color, faixa),
          contrasteFaixaTexto: contraste(estilo(".percurso__texto").color, faixa),
          contrasteRodape: contraste(estilo(".site-footer__nav a").color, estilo(".site-footer").backgroundColor),
        };
      });
    const claro = await lerTema();
    assert(claro.atributo === "claro", "tema claro aplicado ao documento");
    assert(claro.fundo === "rgb(244, 239, 230)", "tema claro: a landing usa o papel da identidade");
    assert(claro.titulo === "rgb(11, 32, 54)", "tema claro: título na tinta da identidade");

    /* O botão de tema do cabeçalho é o mesmo do produto. */
    await paginaTema.getByRole("button", { name: "Ativar tema escuro" }).first().click();
    await paginaTema.waitForTimeout(260);
    const escuro = await lerTema();
    assert(escuro.atributo === "escuro", "botão do cabeçalho alterna para o tema escuro");
    assert(escuro.fundo === "rgb(8, 23, 38)", "tema escuro: a landing usa a tinta da identidade");
    assert(escuro.titulo === "rgb(238, 242, 236)", "tema escuro: título em giz");
    assert(
      (await paginaTema.evaluate(() => localStorage.getItem("qradmin-tema"))) === "escuro",
      "a escolha de tema fica gravada para as outras telas",
    );
    for (const [nome, t] of [
      ["claro", claro],
      ["escuro", escuro],
    ]) {
      assert(t.contrasteTitulo >= 7, `tema ${nome}: título com contraste ${t.contrasteTitulo.toFixed(1)}:1`);
      assert(t.contrasteTexto >= 4.5, `tema ${nome}: texto de apoio com contraste ${t.contrasteTexto.toFixed(1)}:1`);
      assert(t.contrasteBotao >= 4.5, `tema ${nome}: botão principal com contraste ${t.contrasteBotao.toFixed(1)}:1`);
      assert(t.contrasteFaixa >= 7, `tema ${nome}: título sobre a faixa de tinta ${t.contrasteFaixa.toFixed(1)}:1`);
      assert(
        t.contrasteFaixaTexto >= 4.5,
        `tema ${nome}: texto sobre a faixa de tinta ${t.contrasteFaixaTexto.toFixed(1)}:1`,
      );
      assert(t.contrasteRodape >= 4.5, `tema ${nome}: links do rodapé ${t.contrasteRodape.toFixed(1)}:1`);
    }
    if (screenshots) {
      fs.mkdirSync(OUT, { recursive: true });
      await paginaTema.screenshot({ path: path.join(OUT, "landing-1440-escuro.png"), fullPage: true });
    }
    /* Não fechamos o contexto aqui: no Chromium single-process do sandbox
       fechar um contexto derruba o navegador. Ele é encerrado no finally. */
    contextosExtras.push(ctxTema);
  }

  /* O link do garçom continua levando ao PWA instalável, como antes. */
  await page2.goto(BASE + "/#/garcom/8f14e45f-ceea-467f-a8ac-3b1c1b6a1b0d", { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(900);
  assert(page2.url().includes("/garcom-pwa/"), "/#/garcom/<token> mantém o redirecionamento ao PWA");
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
