#!/usr/bin/env node
/**
 * Mede o contraste do texto no DOM renderizado, nos dois temas.
 *
 * Os tokens de cor já são conferidos par a par nos testes de identidade. Isso
 * não basta: um par aprovado no papel pode ser usado sobre outra superfície,
 * com opacidade, ou herdar a cor errada. Este script abre cada tela no
 * Chromium, encontra todo nó de texto visível e compara a cor que foi de fato
 * pintada com o fundo que está atrás dele naquele ponto.
 *
 * Critério: WCAG 2.x AA — 4,5:1 para texto comum e 3:1 para texto grande
 * (24 px, ou 18,66 px em negrito).
 *
 * Uso (servidor local já no ar, com `dist/` atualizado):
 *   BASE_URL=http://127.0.0.1:8080 npm run test:contraste
 *   BASE_URL=http://127.0.0.1:8080 npm run test:contraste -- --com-equipe
 *   npm run test:contraste -- --autoteste
 *
 * `--com-equipe` entra como admin no banco de demonstração (DEMO_ADMIN_PASS no
 * .env local) e mede também painel, cardápio, mesas, garçons, logins, funções,
 * cozinha, bar e caixa. Só navega: além do login, o único clique é nas abas
 * internas de Funções (Histórico, Logins, Limpar), que apenas trocam o painel
 * exibido.
 * As filas da cozinha e do bar abrem recolhidas, então são medidas duas vezes:
 * como abrem e com as duas seções abertas. Para abri-las o script grava a
 * mesma preferência local que o operador grava ao tocar na seção
 * (`localStorage`, nada vai ao servidor) e a apaga em seguida.
 * `--rota=<trecho>` mede só as rotas que contêm o trecho.
 * `--autoteste` planta três textos ilegíveis e exige que os três sejam
 * apontados — prova de que a medição não está cega.
 *
 * O que NÃO é medido: estados de foco e hover, diálogos e abas que não abrem
 * sozinhos, controles desabilitados, texto de placeholder, conteúdo gerado por
 * ::before/::after e texto sobre fotografia (o fundo considerado é a cor, não
 * a imagem). O cardápio do cliente (#/mesa) fica fora de propósito: ele tem
 * identidade própria e congelada.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { chromium as playwrightChromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argumentos = new Set(process.argv.slice(2));
const COM_EQUIPE = argumentos.has("--com-equipe");
const AUTOTESTE = argumentos.has("--autoteste");

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, celular: { width: 390, height: 844 } };
const TEMAS = ["claro", "escuro"];
const PUBLICAS = [
  "/",
  "/#/login",
  "/apresentacao.html",
  "/guia-sistema.html",
  "/politica-de-privacidade.html",
  "/termos-de-servico.html",
  "/termos-de-uso.html",
  "/garcom-pwa/",
];
/* Uma rota é um caminho ou { rota, nome, armazenamento, aba }.
   `armazenamento`: chaves de localStorage gravadas antes de a página carregar
   e apagadas depois da medição.
   `aba`: nome de uma aba interna (nav[data-admin-tabs]) a abrir antes de medir.
   As seções do Admin são só estas cinco; um caminho desconhecido cai no painel
   e seria medido em dobro sem acusar nada. */
const FILA_ABERTA = JSON.stringify({ em_producao: true, na_fila: true });
const EQUIPE = [
  "/#/admin/painel",
  "/#/admin/cardapio",
  "/#/admin/mesas",
  "/#/admin/garcons",
  "/#/admin/funcoes",
  { rota: "/#/admin/funcoes", nome: "/#/admin/funcoes › Histórico", aba: "Histórico" },
  { rota: "/#/admin/funcoes", nome: "/#/admin/funcoes › Logins", aba: "Logins" },
  { rota: "/#/admin/funcoes", nome: "/#/admin/funcoes › Limpar", aba: "Limpar" },
  "/#/cozinha",
  { rota: "/#/cozinha", nome: "/#/cozinha (seções abertas)", armazenamento: { "qradmin-fila-producao-abertas:cozinha": FILA_ABERTA } },
  "/#/bar",
  { rota: "/#/bar", nome: "/#/bar (seções abertas)", armazenamento: { "qradmin-fila-producao-abertas:bar": FILA_ABERTA } },
  "/#/caixa",
];
const FILTRO_DE_ROTA = [...argumentos].find((a) => a.startsWith("--rota="))?.slice("--rota=".length) || "";

function origemLocal(valor) {
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new Error("BASE_URL inválida.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("BASE_URL precisa ser HTTP local (localhost/loopback): este script nunca roda contra produção.");
  }
  return url.origin;
}

async function iniciarChromium() {
  const { default: chromiumPacote, inflate } = await import("@sparticuz/chromium");
  const biblioteca = path.join(ROOT, "node_modules", "@sparticuz", "chromium", "bin", "al2023.tar.br");
  if (fs.existsSync(biblioteca)) await inflate(biblioteca);
  process.env.LD_LIBRARY_PATH = ["/tmp/al2023/lib", "/tmp/al2023/usr/lib", process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(path.delimiter);
  return playwrightChromium.launch({
    // Vários contextos no mesmo navegador: em processo único, fechar o
    // primeiro contexto derruba o Chromium inteiro (mesmo filtro dos E2E).
    args: chromiumPacote.args.filter((argumento) => argumento !== "--single-process"),
    executablePath: await chromiumPacote.executablePath(),
    headless: true,
  });
}

/** Roda dentro da página. Devolve os pares texto/fundo abaixo do mínimo. */
function medirNaPagina() {
  const tela = document.createElement("canvas");
  tela.width = tela.height = 1;
  const pincel = tela.getContext("2d", { willReadFrequently: true });
  // Qualquer sintaxe de cor (rgb, color-mix já resolvido, color(srgb …)) -> [r, g, b, a]
  const cor = (texto) => {
    pincel.clearRect(0, 0, 1, 1);
    pincel.fillStyle = "#000";
    pincel.fillStyle = texto;
    pincel.fillRect(0, 0, 1, 1);
    const d = pincel.getImageData(0, 0, 1, 1).data;
    const a = d[3] / 255;
    return a === 0 ? [0, 0, 0, 0] : [d[0], d[1], d[2], a];
  };
  const sobre = (frente, fundo) => [0, 1, 2].map((i) => frente[i] * frente[3] + fundo[i] * (1 - frente[3])).concat(1);
  const linear = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = (c) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
  const razao = (a, b) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // Fundo real sob o texto: tudo o que está pintado naquele ponto, de baixo
  // para cima, a partir do próprio elemento. Inclui irmãos posicionados atrás
  // (a pílula do segmento ativo, por exemplo), e não só a cadeia de ancestrais.
  const fundoDe = (el, no) => {
    const faixa = document.createRange();
    faixa.selectNodeContents(no);
    const r = faixa.getClientRects()[0] || el.getBoundingClientRect();
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    let camadas = [];
    if (r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) {
      const noPonto = document.elementsFromPoint(x, y);
      const inicio = noPonto.findIndex((n) => n === el || n.contains(el));
      if (inicio >= 0) camadas = noPonto.slice(inicio);
    }
    if (!camadas.length) for (let n = el; n; n = n.parentElement) camadas.push(n);
    const pilha = [];
    let sobreImagem = false;
    for (const n of camadas) {
      const estilo = getComputedStyle(n);
      if (estilo.backgroundImage && estilo.backgroundImage !== "none") sobreImagem = true;
      const c = cor(estilo.backgroundColor);
      const opacidade = n.contains(el) ? 1 : parseFloat(estilo.opacity);
      if (c[3] > 0) {
        pilha.push([c[0], c[1], c[2], c[3] * opacidade]);
        if (c[3] * opacidade >= 0.999) break;
      }
    }
    let base = [255, 255, 255, 1];
    const raiz = cor(getComputedStyle(document.documentElement).backgroundColor);
    if (raiz[3] > 0) base = sobre(raiz, base);
    for (const c of pilha.reverse()) base = sobre(c, base);
    return { base, sobreImagem };
  };

  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n = el; n; n = n.parentElement) {
      const estilo = getComputedStyle(n);
      if (estilo.display === "none" || estilo.visibility !== "visible" || parseFloat(estilo.opacity) === 0) return false;
      if (n.hasAttribute("hidden") || n.classList.contains("sr-only")) return false;
    }
    return true;
  };

  const achados = new Map();
  let medidos = 0;
  const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let no = andar.nextNode(); no; no = andar.nextNode()) {
    const texto = no.textContent.trim();
    const el = no.parentElement;
    if (!texto || !el || el.closest("svg, script, style, noscript") || !visivel(el)) continue;
    if (el.closest("[disabled], [aria-disabled='true']")) continue;
    const estilo = getComputedStyle(el);
    const tamanho = parseFloat(estilo.fontSize);
    if (tamanho < 1) continue; // rótulo recolhido de propósito
    const caixa = el.getBoundingClientRect();
    if (caixa.top < 0 || caixa.bottom > innerHeight) el.scrollIntoView({ block: "center", behavior: "instant" });

    let opacidade = 1;
    for (let n = el; n; n = n.parentElement) opacidade *= parseFloat(getComputedStyle(n).opacity);
    const { base, sobreImagem } = fundoDe(el, no);
    const tinta = cor(estilo.color);
    const frente = sobre([tinta[0], tinta[1], tinta[2], tinta[3] * opacidade], base);
    const peso = Number(estilo.fontWeight) || 400;
    const minimo = tamanho >= 24 || (tamanho >= 18.66 && peso >= 700) ? 3 : 4.5;
    const valor = razao(frente, base);
    medidos += 1;
    if (valor >= minimo) continue;

    const caminho = [];
    for (let n = el; n && n !== document.body && caminho.length < 3; n = n.parentElement) {
      const classes = typeof n.className === "string" && n.className ? "." + n.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      caminho.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + classes);
    }
    const chave = `${caminho.join(" > ")}|${hex(frente)}|${hex(base)}`;
    const anterior = achados.get(chave);
    if (anterior) anterior.vezes += 1;
    else {
      achados.set(chave, {
        razao: Math.round(valor * 100) / 100,
        minimo,
        tamanho,
        peso,
        frente: hex(frente),
        fundo: hex(base),
        sobreImagem,
        caminho: caminho.join(" > "),
        texto: texto.slice(0, 48),
        vezes: 1,
      });
    }
  }
  return { medidos, achados: [...achados.values()] };
}

async function abrir(context, url, armazenamento = null) {
  const page = await context.newPage();
  if (armazenamento) {
    await page.addInitScript((chaves) => {
      try {
        for (const [chave, valor] of Object.entries(chaves)) localStorage.setItem(chave, valor);
      } catch {
        /* sem armazenamento a tela abre no estado padrão e a conferência abaixo acusa */
      }
    }, armazenamento);
  }
  await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return page;
}

async function entrarComoAdmin(context, origem) {
  const envArquivo = fs.existsSync(path.join(ROOT, ".env")) ? dotenv.parse(fs.readFileSync(path.join(ROOT, ".env"))) : {};
  const senha = process.env.ADMIN_PASS || envArquivo.DEMO_ADMIN_PASS;
  if (!senha) throw new Error("Defina DEMO_ADMIN_PASS no .env local (banco de demonstração) para usar --com-equipe.");
  const page = await context.newPage();
  await page.goto(`${origem}/#/login`, { waitUntil: "load" });
  await page.locator("#login-titulo").waitFor({ state: "visible" });
  await page.getByRole("button", { name: /^Admin/ }).click();
  await page.locator("#login-senha").fill(String(senha));
  const resposta = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/login", { timeout: 18000 });
  await page.getByRole("button", { name: /Entrar em Admin/ }).click();
  const status = (await resposta).status();
  /* O servidor aceita 8 logins a cada 5 minutos por IP; cada execução usa 4
     (um por tema e tela). Duas execuções seguidas esbarram no limite. */
  if (status === 429) throw new Error("O servidor recusou o login por limite de tentativas (8 a cada 5 minutos por IP). Aguarde alguns minutos e rode de novo.");
  if (status >= 400) throw new Error(`O servidor recusou o login (HTTP ${status}). Confira DEMO_ADMIN_PASS no .env local.`);
  await page.waitForFunction(() => location.hash.includes("/admin"), null, { timeout: 18000 });
  await page.close();
}

async function autoteste(browser) {
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4efe6;font:16px sans-serif">
    <p id="bom" style="color:#0b2036">texto legível</p>
    <p id="fraco" style="color:#8a8a8a;background:#a0a0a0">texto fraco sobre o próprio fundo</p>
    <div style="position:relative;height:40px">
      <span style="position:absolute;inset:0;background:#0c2c4c"></span>
      <span id="irmao" style="position:relative;color:#3f5167">texto sobre irmão posicionado</span>
    </div>
    <p id="apagado" style="color:#0b2036;opacity:.3">texto esmaecido por opacidade</p>
  </body></html>`);
  const { medidos, achados } = await page.evaluate(medirNaPagina);
  await context.close();
  const apontados = achados.map((a) => a.caminho).sort().join(", ");
  const esperado = ["p#apagado", "p#fraco", "div > span#irmao"].sort().join(", ");
  if (medidos !== 4 || apontados !== esperado) {
    throw new Error(`autoteste falhou: mediu ${medidos} textos e apontou [${apontados}]; esperado 4 textos e [${esperado}]`);
  }
  console.log("OK   autoteste: os três textos ilegíveis foram apontados e o legível passou");
}

async function main() {
  const browser = await iniciarChromium();
  let falhas = 0;
  let estados = 0;
  let textos = 0;
  try {
    await autoteste(browser);
    if (AUTOTESTE) return;

    const origem = origemLocal(process.env.BASE_URL || "http://127.0.0.1:8080");
    for (const [nomeViewport, viewport] of Object.entries(VIEWPORTS)) {
      for (const tema of TEMAS) {
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: 1,
          locale: "pt-BR",
          colorScheme: tema === "escuro" ? "dark" : "light",
          reducedMotion: "reduce",
        });
        await context.addInitScript((t) => {
          try {
            localStorage.setItem("qradmin-tema", t);
          } catch {
            /* armazenamento indisponível: vale o esquema do sistema */
          }
        }, tema);
        if (COM_EQUIPE) await entrarComoAdmin(context, origem);
        for (const entrada of [...PUBLICAS, ...(COM_EQUIPE ? EQUIPE : [])]) {
          const { rota, nome = rota, armazenamento = null, aba = null } = typeof entrada === "string" ? { rota: entrada } : entrada;
          if (FILTRO_DE_ROTA && !nome.includes(FILTRO_DE_ROTA)) continue;
          const page = await abrir(context, origem + rota, armazenamento);
          if (aba) {
            await page.locator("nav[data-admin-tabs]").getByRole("button", { name: aba, exact: true }).click();
            await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
            await page.waitForTimeout(700);
          }
          const aplicado = await page.evaluate(() => document.documentElement.dataset.theme || "");
          /* Com a preferência gravada, nenhuma seção recolhível pode ter ficado fechada. */
          const fechadas = armazenamento ? await page.locator('.ops-sessao__toggle[aria-expanded="false"]').count() : 0;
          const { medidos, achados } = await page.evaluate(medirNaPagina);
          if (armazenamento) {
            await page.evaluate((chaves) => {
              for (const chave of chaves) localStorage.removeItem(chave);
            }, Object.keys(armazenamento));
          }
          await page.close();
          estados += 1;
          textos += medidos;
          const rotulo = `${tema}/${nomeViewport} ${nome}`;
          if (fechadas) {
            falhas += 1;
            console.log(`FALHA ${rotulo} — ${fechadas} seção(ões) continuaram recolhidas: o conteúdo não foi medido`);
            continue;
          }
          if (medidos === 0) {
            falhas += 1;
            console.log(`FALHA ${rotulo} — nenhum texto encontrado: a tela não carregou`);
            continue;
          }
          if (aplicado !== tema) {
            falhas += 1;
            console.log(`FALHA ${rotulo} — a página não aplicou o tema pedido (data-theme="${aplicado}")`);
            continue;
          }
          if (!achados.length) {
            console.log(`OK   ${rotulo} — ${medidos} textos`);
            continue;
          }
          falhas += achados.length;
          console.log(`FALHA ${rotulo} — ${achados.length} par(es) abaixo do mínimo em ${medidos} textos`);
          for (const a of achados.slice(0, 20)) {
            console.log(
              `       ${a.razao}:1 (mínimo ${a.minimo}) ${a.frente} sobre ${a.fundo}${a.sobreImagem ? " [fundo com imagem]" : ""}` +
                ` · ${a.tamanho}px/${a.peso} ×${a.vezes} · ${a.caminho} · “${a.texto}”`,
            );
          }
        }
        await context.close();
      }
    }
    console.log(`\n${estados} estados, ${textos} textos medidos, ${falhas} par(es) abaixo de AA.`);
  } finally {
    await browser.close().catch(() => {});
  }
  if (falhas) process.exitCode = 1;
}

main().catch((erro) => {
  console.error(erro.message || erro);
  process.exitCode = 1;
});
