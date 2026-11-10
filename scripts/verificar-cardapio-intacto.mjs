#!/usr/bin/env node
/**
 * Prova de que o cardápio do cliente (#/mesa/:token) não mudou.
 *
 * O rebranding "Passe" troca tokens, fontes e componentes do produto inteiro,
 * mas o cardápio do cliente é a exceção combinada: nenhum pixel dele pode
 * mudar. Ler o diff não prova isso — a tela herda tokens globais (`--font-*`,
 * `--radius-*`, `--status-*`, sombras, regras `:where()`), então uma mudança
 * em outro arquivo pode vazar para ela sem tocar em `Mesa.tsx`.
 *
 * Este script compara os dois builds de verdade:
 *
 *   1. extrai o `dist/` da base (por padrão `origin/main`) com `git archive`;
 *   2. serve o build da base e o `dist/` atual em duas portas locais;
 *   3. abre o cardápio nos dois, em Chromium real, com a mesma API simulada,
 *      o mesmo relógio (parado e avançado em passos iguais) e os mesmos
 *      estados — cardápio, busca, produto, barra de pedido, carrinho, conta,
 *      aviso de comanda enviada, conta após o envio e troca de tema pelo
 *      botão do cabeçalho — em celular e desktop, tema claro e escuro;
 *   4. exige que a marcação (tag, todos os atributos e o texto de cada
 *      elemento) seja a mesma e que o estilo computado de TODOS os elementos,
 *      e o valor de toda custom property conhecida pela base, sejam iguais —
 *      sem nenhuma folga. As capturas precisam sair idênticas pixel a pixel
 *      ou dentro do ruído que o próprio Chromium produz ao redesenhar a mesma
 *      página (no máximo 0,02% do quadro, cada pixel com até 16/255; ver
 *      TOLERANCIA). A mesma execução mede esse ruído comparando a base com
 *      uma segunda renderização dela mesma e o imprime ao lado de cada linha;
 *   5. exige que toda imagem e toda fonte que o cardápio baixa tenha os
 *      mesmos bytes nos dois builds;
 *   6. exige que os arquivos exclusivos do cardápio (a tela, o estilo dela e
 *      as páginas legadas com tudo o que carregam) estejam byte a byte iguais
 *      aos da base, e lista quais módulos compartilhados mudaram.
 *
 * Uso:
 *   NODE_ENV=production npm run build  # o dist/ que vai para o repositório
 *   npm run test:cardapio-intacto
 *
 * Opções:
 *   --base <ref>     ref git com o build de referência (padrão: origin/main,
 *                    depois main; também via CARDAPIO_BASE_REF)
 *   --dist <dir>     build a conferir (padrão: dist/). Serve para testar a
 *                    própria prova contra um build adulterado de propósito
 *   --out <dir>      onde gravar as capturas (padrão: não grava; em caso de
 *                    diferença grava sempre em .cardapio-intacto/)
 *   --autoteste      compara a base com ela mesma pelo mesmo caminho: marcação
 *                    e estilo têm de dar zero diferença, e os pixels mostram
 *                    quanto o método diverge sozinho (a régua do ruído)
 *   --sem-redesenho  não força o redesenho antes da captura (ver `redesenhar`):
 *                    mostra o ruído de histórico de pintura do Chromium
 *   --vp <id>        só um viewport (celular | desktop)
 *   --tema <id>      só um tema (claro | escuro)
 *
 * Nenhum banco é usado e nada sai de 127.0.0.1.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { fontesDoCardapio } from "./lib/arvore-do-cardapio.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const AUTOTESTE = args.includes("--autoteste");
const SEM_REDESENHO = args.includes("--sem-redesenho");
const DIR_SAIDA = opcao("--out");

const git = (...a) => execFileSync("git", a, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refExiste = (ref) => {
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
};
const baseRef = opcao("--base") || process.env.CARDAPIO_BASE_REF || ["origin/main", "main"].find(refExiste);
if (!baseRef || !refExiste(baseRef)) {
  console.error("Não encontrei a ref de base. Informe --base <ref> (por exemplo, o commit da main).");
  process.exit(2);
}
const baseSha = git("rev-parse", "--short=12", `${baseRef}^{commit}`);

const distAtual = path.resolve(RAIZ, opcao("--dist") || "dist");
if (!AUTOTESTE && !fs.existsSync(path.join(distAtual, "index.html"))) {
  console.error(`${path.relative(RAIZ, distAtual) || distAtual}/index.html não existe. Rode \`npm run build\` antes.`);
  process.exit(2);
}

/* --- build de referência ---------------------------------------------------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cardapio-intacto-"));
const tar = execFileSync("git", ["archive", "--format=tar", baseRef, "dist"], { cwd: RAIZ, maxBuffer: 512 * 1024 * 1024 });
execFileSync("tar", ["-x", "-C", tmp], { input: tar });
const distBase = path.join(tmp, "dist");
if (!fs.existsSync(path.join(distBase, "index.html"))) {
  console.error(`A ref ${baseRef} não tem dist/index.html versionado.`);
  process.exit(2);
}

/* --- servidor estático mínimo (mesma regra de fallback do server.js) --------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};
function servir(dir) {
  const raiz = path.resolve(dir);
  /* caminho pedido → sha1 do que foi entregue (ou "404") */
  const pedidos = new Map();
  const servidor = http.createServer((req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let arquivo = path.resolve(raiz, "." + caminho);
    if (!arquivo.startsWith(raiz)) { res.writeHead(400).end(); return; }
    if (!path.extname(caminho)) arquivo = path.join(raiz, "index.html");
    fs.readFile(arquivo, (erro, dados) => {
      if (erro) { pedidos.set(caminho, "404"); res.writeHead(404, { "Content-Type": "text/plain" }).end("404"); return; }
      pedidos.set(caminho, crypto.createHash("sha1").update(dados).digest("hex"));
      res.writeHead(200, { "Content-Type": MIME[path.extname(arquivo)] || "application/octet-stream", "Cache-Control": "no-store" }).end(dados);
    });
  });
  return new Promise((resolve, reject) => {
    servidor.on("error", reject);
    servidor.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${servidor.address().port}`, pedidos, fechar: () => servidor.close() }));
  });
}

/* --- arquivos do cardápio: iguais aos da base? ------------------------------ */
/* Exclusivos: só o cardápio usa. O rebranding não tem motivo para encostar
   neles, então precisam estar byte a byte iguais aos da base. */
const EXCLUSIVOS_DO_CARDAPIO = ["src/screens/Mesa.tsx", "src/screens/mesa-praia.css"];
/* Páginas legadas do cliente (servidas quando não há build do SPA). */
const PAGINAS_LEGADAS = ["public/mesa.html", "public/pedido.html"];

const lerDaBase = (arquivo) => {
  try {
    return execFileSync("git", ["show", `${baseRef}:${arquivo}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
};
const lerDoDisco = (arquivo) => {
  try {
    return fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
  } catch {
    return null;
  }
};
/* Compara os bytes da base com a ÁRVORE DE TRABALHO (inclui o que ainda não
   foi commitado). Arquivo que não existe num dos lados conta como diferente. */
const igualNaBase = (arquivo) => {
  try {
    const naBase = execFileSync("git", ["show", `${baseRef}:${arquivo}`], { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
    return naBase.equals(fs.readFileSync(path.join(RAIZ, arquivo)));
  } catch {
    return false;
  }
};
/* Tudo o que uma página estática carrega, seguindo href/src/url()/@import. */
function fechoLegado(ler) {
  const vistos = new Set();
  const fila = PAGINAS_LEGADAS.filter((arquivo) => ler(arquivo) !== null);
  while (fila.length) {
    const atual = fila.pop();
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    if (!/\.(html|css)$/.test(atual)) continue;
    const texto = ler(atual);
    if (texto === null) continue;
    const pasta = atual.split("/").slice(0, -1).join("/");
    const referencias = /\.html$/.test(atual)
      ? [...texto.matchAll(/(?:href|src)\s*=\s*["']([^"'#?]+)/g)].map((m) => m[1])
      : [...texto.matchAll(/url\(\s*["']?([^"')#?]+)/g), ...texto.matchAll(/@import\s+["']([^"']+)/g)].map((m) => m[1]);
    for (const ref of referencias) {
      if (/^(?:[a-z]+:|\/\/|data:)/i.test(ref)) continue;
      const alvo = path.posix.normalize(ref.startsWith("/") ? `public${ref}` : `${pasta}/${ref}`);
      if (alvo.startsWith("public/") && path.posix.extname(alvo)) fila.push(alvo);
    }
  }
  return [...vistos].sort();
}

function conferirArquivos() {
  const achados = [];
  const exclusivos = [...new Set([...EXCLUSIVOS_DO_CARDAPIO, ...fechoLegado(lerDaBase)])];
  for (const arquivo of exclusivos) {
    if (!igualNaBase(arquivo)) achados.push(`arquivo exclusivo do cardápio difere da base (ou sumiu): ${arquivo}`);
  }
  /* Módulos que desenham o cardápio mas também servem ao resto do produto:
     podem mudar; o efeito no cardápio é o que as comparações medem. */
  const grafo = [...fontesDoCardapio(lerDoDisco).keys()].filter((arquivo) => !exclusivos.includes(arquivo)).sort();
  const alterados = grafo.filter((arquivo) => !igualNaBase(arquivo));
  return { achados, exclusivos, grafo, alterados };
}

/* --- API simulada: idêntica para os dois builds ------------------------------ */
const fixture = (nome) => JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "fixtures", "cardapio-intacto", nome), "utf8"));
const CARDAPIO = fixture("cardapio.json");
const SESSAO = fixture("sessao.json");
const TOKEN = "cardapio-intacto";
/* Relógio congelado alguns minutos depois do último pedido da fixture: tempos
   relativos ("há 12 min") saem iguais nas duas capturas. */
const AGORA = new Date("2026-11-10T02:45:00.000Z");

async function simularApi(route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  if (p === "/api/cardapio") return route.fulfill({ json: CARDAPIO });
  if (p === `/api/mesas/${TOKEN}/sessao`) return route.fulfill({ json: SESSAO });
  if (p === `/api/mesas/${TOKEN}/pedidos` && req.method() === "POST") return route.fulfill({ status: 201, json: { ok: true, pedidoId: 99 } });
  if (p === "/api/events/ticket") return route.fulfill({ status: 201, json: { ticket: "t", expiresIn: 60 } });
  if (p.startsWith("/api/events")) return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": prova\n\n" });
  if (p === "/api/me") return route.fulfill({ status: 401, json: { error: "não autenticado" } });
  return route.fulfill({ status: 404, json: { error: "rota não simulada: " + p } });
}

/* --- o que é medido em cada estado -------------------------------------------- */
/* As ÚNICAS diferenças de marcação admitidas, as duas no <html> e as duas
   consequência direta do isolamento:

   - `data-identidade="cardapio"`: a chave que liga a identidade antiga
     (public/garcom-pwa/theme-init.js). Precisa existir no build atual e não
     existe na base.
   - as custom properties que a base escrevia inline (`style="--surface: …"`,
     doze tokens postos por src/lib/tema.ts). Hoje os mesmos tokens vêm da
     folha congelada do cardápio. O VALOR de cada um continua conferido, um a
     um, em "custom properties"; só deixou de importar ONDE foi declarado. O
     resto do `style` do <html> (ex.: `color-scheme`) é comparado normalmente.

   Qualquer outro atributo, classe ou texto diferente, em qualquer elemento,
   reprova. */
const MARCACAO_ADMITIDA = { html: { atributos: ["data-identidade"], estiloSemVariaveis: true } };

/* Roda dentro da página. Devolve um retrato COMPACTO: por elemento, uma
   assinatura do estilo computado (todas as propriedades, mais ::before e
   ::after), a caixa de layout e uma assinatura da marcação (tag, atributos e
   texto); mais o valor de toda custom property declarada.
   O detalhe por propriedade só é pedido depois, para o que divergir. */
function retratoDaPagina({ nomesDaBase = [], admitida = {} } = {}) {
  const assinar = (texto) => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  /* Os nomes vistos na base entram na leitura do build atual: uma custom
     property cuja declaração sumiu do CSS precisa aparecer como "vazia", não
     passar despercebida. */
  const nomes = new Set(nomesDaBase);
  const coletar = (regras) => {
    for (const regra of regras) {
      if (regra.cssRules) coletar(regra.cssRules);
      if (regra.style) for (const prop of regra.style) if (prop.startsWith("--")) nomes.add(prop);
    }
  };
  for (const folha of document.styleSheets) {
    try { coletar(folha.cssRules); } catch { /* folha de outra origem: não existe aqui */ }
  }
  const variaveis = {};
  for (const [rotulo, el] of [["html", document.documentElement], ["body", document.body]]) {
    const cs = getComputedStyle(el);
    for (const nome of [...nomes].sort()) variaveis[`${rotulo} ${nome}`] = cs.getPropertyValue(nome).trim();
  }
  const caminhoDe = (el) => {
    const partes = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      partes.unshift(`${n.tagName.toLowerCase()}:${[...n.parentElement.children].indexOf(n)}`);
    }
    return partes.join(">");
  };
  const textoDoEstilo = (cs) => {
    let t = "";
    for (const prop of cs) if (!prop.startsWith("--")) t += prop + ":" + cs.getPropertyValue(prop) + ";";
    return t;
  };
  /* Marcação: tag, todos os atributos (ordenados) e os nós de texto diretos. */
  const atributosDe = (el, rotulo) => {
    const regra = admitida[rotulo] || {};
    const saida = {};
    for (const a of el.attributes) {
      if ((regra.atributos || []).includes(a.name)) continue;
      saida[a.name] = a.name === "style" && regra.estiloSemVariaveis
        ? a.value.split(";").map((d) => d.trim()).filter((d) => d && !d.startsWith("--")).join("; ")
        : a.value;
    }
    return saida;
  };
  const marcacaoDe = (el, rotulo) => {
    const attrs = Object.entries(atributosDe(el, rotulo)).map(([nome, valor]) => `${nome}=${JSON.stringify(valor)}`).sort().join(" ");
    let texto = "";
    for (const n of el.childNodes) if (n.nodeType === 3) texto += n.nodeValue + "\u241f";
    return `${el.namespaceURI === "http://www.w3.org/1999/xhtml" ? "" : el.namespaceURI + "|"}${el.tagName}[${attrs}]${texto}`;
  };
  const elementos = [];
  let propriedades = 0;
  let atributosLidos = 0;
  for (const el of [document.documentElement, document.body, ...document.body.querySelectorAll("*")]) {
    if (el.closest("script, style")) continue;
    const cs = getComputedStyle(el);
    if (!propriedades) for (const prop of cs) if (!prop.startsWith("--")) propriedades++;
    let texto = textoDoEstilo(cs);
    for (const pseudo of ["::before", "::after"]) {
      const pcs = getComputedStyle(el, pseudo);
      if (pcs.content && pcs.content !== "none" && pcs.content !== "normal") texto += pseudo + "{" + textoDoEstilo(pcs) + "}";
    }
    const r = el.getBoundingClientRect();
    /* Identidade estável do nó: a posição na árvore, não as classes — um
       componente compartilhado pode trocar de classe sem mudar de aparência. */
    const rotulo = el === document.documentElement ? "html" : el === document.body ? "body" : caminhoDe(el);
    atributosLidos += el.attributes.length;
    elementos.push([
      rotulo,
      [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100).join(","),
      assinar(texto),
      assinar(marcacaoDe(el, rotulo)),
    ]);
  }
  return {
    variaveis,
    elementos,
    propriedades,
    atributosLidos,
    admitidaPresente: Object.entries(admitida).flatMap(([rotulo, regra]) => {
      const el = rotulo === "html" ? document.documentElement : rotulo === "body" ? document.body : null;
      return (regra.atributos || []).filter((nome) => el?.hasAttribute(nome)).map((nome) => `${rotulo}[${nome}="${el.getAttribute(nome)}"]`);
    }),
    fontes: [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight} ${f.style}`).sort(),
    nomes: [...nomes],
    atributos: {
      htmlClass: document.documentElement.className, htmlTheme: document.documentElement.dataset.theme || "",
      bodyMesa: document.body.hasAttribute("data-mesa-praia"),
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "",
      titulo: document.title,
      /* ícone da aba e de toque: o cliente também vê isso */
      icones: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')]
        .map((l) => `${l.getAttribute("rel")}|${l.getAttribute("type") || ""}|${l.getAttribute("sizes") || ""}|${l.getAttribute("href")}`).join(" · "),
    },
  };
}

/* Detalhe por propriedade de um conjunto de nós (só para o que divergiu). */
function detalharElementos({ caminhos, admitida = {} }) {
  const achar = (caminho) => {
    if (caminho === "html") return document.documentElement;
    if (caminho === "body") return document.body;
    let n = document.body;
    for (const parte of caminho.split(">")) {
      n = n?.children[Number(parte.split(":")[1])];
      if (!n) return null;
    }
    return n;
  };
  const saida = {};
  for (const caminho of caminhos) {
    const el = achar(caminho);
    if (!el) { saida[caminho] = null; continue; }
    const estilo = {};
    const ler = (cs, prefixo) => { for (const prop of cs) if (!prop.startsWith("--")) estilo[prefixo + prop] = cs.getPropertyValue(prop); };
    ler(getComputedStyle(el), "");
    for (const pseudo of ["::before", "::after"]) {
      const pcs = getComputedStyle(el, pseudo);
      if (pcs.content && pcs.content !== "none" && pcs.content !== "normal") ler(pcs, pseudo + " ");
    }
    const marcacao = { "(tag)": el.tagName };
    const regra = admitida[caminho] || {};
    for (const a of el.attributes) {
      if ((regra.atributos || []).includes(a.name)) continue;
      marcacao[`atributo ${a.name}`] = a.name === "style" && regra.estiloSemVariaveis
        ? a.value.split(";").map((d) => d.trim()).filter((d) => d && !d.startsWith("--")).join("; ")
        : a.value;
    }
    let direto = "";
    for (const n of el.childNodes) if (n.nodeType === 3) direto += n.nodeValue + "\u241f";
    marcacao["(texto)"] = direto;
    saida[caminho] = { rotulo: `<${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.classList.length ? "." + [...el.classList].slice(0, 3).join(".") : ""}>`, estilo, marcacao };
  }
  return saida;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* O relógio da página fica PARADO (ver `abrir`): tempo só anda por `runFor`,
   igual nos dois builds. Por isso a espera abaixo não usa temporizadores da
   página — só promessas de fonte/imagem e sondagem feita pelo Node. */
async function assentar(page, avancarMs = 900) {
  await page.clock.runFor(avancarMs);
  await page.evaluate(async () => {
    /* Normalização aplicada igualmente aos dois builds: imagens lazy fora da
       tela carregam em momentos diferentes e mudariam o layout medido. */
    for (const img of document.images) img.loading = "eager";
    if (document.fonts?.ready) await document.fonts.ready;
  });
  for (let i = 0; i < 100; i++) {
    const pendentes = await page.evaluate(() => [...document.images].filter((img) => img.currentSrc && !img.complete).length);
    if (!pendentes) break;
    await dormir(100);
  }
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
  /* Transições CSS correm no relógio real do compositor. */
  await dormir(450);
  await page.clock.runFor(100);
  await redesenhar(page);
}

/* O Chromium guarda o desenho de cada elemento e só o refaz quando o estilo
   dele muda. Um elemento cujo último desenho aconteceu no fim de uma transição
   (o botão de tema do cardápio passa por uma, de cor, logo que a tela monta)
   fica com o contorno suavizado de um jeito levemente diferente do mesmo
   elemento desenhado direto no estado final: algumas dezenas de pixels de
   borda, com estilo computado, caixa e marcação idênticos. Qual das versões
   aparece depende do histórico de repintura da página (em que momento a
   transição caiu em relação aos quadros), que muda com o tempo de carga do
   bundle. A própria base produz as duas: basta um redesenho qualquer do botão
   para ela passar a exibir exatamente os pixels do build atual.

   Isso é histórico de pintura, não aparência. Para comparar aparência, as três
   páginas (base, atual e controle) são obrigadas a redesenhar todos os
   elementos a partir do estado final, do mesmo jeito: uma folha temporária
   desliga as transições e dá a cada elemento um contorno transparente (o que
   invalida o desenho dele sem mexer no leiaute); em seguida o contorno sai e,
   por último, a folha. Nada disso fica na página: o estilo computado medido
   depois é o original, e nenhuma transição é disparada no caminho.

   `--sem-redesenho` desliga esta etapa e mostra o ruído cru. */
async function redesenhar(page) {
  if (SEM_REDESENHO) return;
  await page.evaluate(() => {
    const folha = new CSSStyleSheet();
    folha.replaceSync("*,*::before,*::after{transition:none!important;outline:1px solid transparent!important;text-shadow:0 0 0 transparent!important}");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, folha];
    void document.documentElement.offsetHeight;
    /* o contorno sai com as transições ainda desligadas: não há o que animar */
    folha.replaceSync("*,*::before,*::after{transition:none!important}");
    void document.documentElement.offsetHeight;
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((f) => f !== folha);
    void document.documentElement.offsetHeight;
  });
  await dormir(120);
}

/* O Chromium guarda cada foto já reduzida na escala em que ela foi desenhada
   pela PRIMEIRA vez. Se a primeira pintura caiu no meio de uma animação de
   entrada, a versão guardada é outra e a foto final sai com diferenças de
   poucos níveis — sem que nenhum estilo tenha mudado. Esvaziar esse cache
   obriga as duas páginas a redecodificar as imagens na escala final. */
const sessoesCdp = new WeakMap();
async function redecodificar(page) {
  let cdp = sessoesCdp.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    sessoesCdp.set(page, cdp);
  }
  await cdp.send("Memory.simulatePressureNotification", { level: "critical" }).catch(() => {});
  await dormir(260);
}

/* Captura só quando dois quadros seguidos saem idênticos: elimina ruído de
   rasterização (a primeira pintura de uma imagem pode usar filtro provisório). */
async function capturaEstavel(page) {
  const opcoes = { fullPage: false, animations: "disabled", caret: "hide" };
  await redecodificar(page);
  let anterior = await page.screenshot(opcoes);
  for (let i = 0; i < 10; i++) {
    await dormir(220);
    const atual = await page.screenshot(opcoes);
    if (atual.equals(anterior)) return atual;
    anterior = atual;
  }
  return anterior;
}

const filtro = (nome) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : null);
const VIEWPORTS = [
  { id: "celular", width: 390, height: 844 },
  { id: "desktop", width: 1440, height: 900 },
].filter((vp) => !filtro("--vp") || vp.id === filtro("--vp"));
const TEMAS = ["claro", "escuro"].filter((tema) => !filtro("--tema") || tema === filtro("--tema"));

/* Cada estado parte do anterior, como um cliente usaria a tela. Os passos são
   idênticos nos dois builds. `avancar` é quanto o relógio da página anda depois
   da ação (padrão 900 ms). */
const ESTADOS = [
  { id: "01-cardapio", preparar: async () => {} },
  { id: "02-busca", preparar: async (page) => { await page.locator('input[type="search"], input[placeholder]').first().fill("pastel"); } },
  {
    id: "03-produto",
    preparar: async (page) => {
      await page.locator('input[type="search"], input[placeholder]').first().fill("");
      await page.clock.runFor(400);
      await page.getByRole("button", { name: "Montar", exact: true }).first().click();
    },
  },
  { id: "04-barra-de-pedido", preparar: async (page) => { await page.getByRole("button", { name: /Adicionar ao pedido/ }).click(); } },
  {
    id: "05-carrinho",
    preparar: async (page, vp) => { if (vp.id === "celular") await page.getByRole("button", { name: /^Pedir/ }).click(); },
  },
  {
    id: "06-conta",
    preparar: async (page, vp) => {
      if (vp.id === "celular") {
        await page.getByRole("button", { name: "Fechar", exact: true }).first().click();
        await page.clock.runFor(600);
        await page.locator("header button").filter({ hasText: /^R\$/ }).first().click();
      } else {
        await page.locator("button").filter({ hasText: /^Conta/ }).first().click();
      }
    },
  },
  {
    /* O aviso "Comanda enviada" dura 1,8 s na tela real. Com o relógio parado
       ele fica congelado depois da animação de entrada (160 ms). */
    id: "07-comanda-enviada",
    avancar: 600,
    preparar: async (page, vp) => {
      if (vp.id === "celular") {
        await page.getByRole("button", { name: "Fechar", exact: true }).first().click();
        await page.clock.runFor(600);
        await page.getByRole("button", { name: /^Pedir/ }).click();
        await page.clock.runFor(600);
      } else {
        await page.locator("button").filter({ hasText: /^Comanda/ }).first().click();
        await page.clock.runFor(300);
      }
      await page.getByRole("button", { name: /Enviar pra cozinha/ }).click();
    },
  },
  /* Passados os 1,8 s o aviso some e a conta abre sozinha. */
  { id: "08-conta-apos-envio", avancar: 2600, preparar: async () => {} },
  {
    /* O cliente troca o tema pelo botão do cabeçalho. Passa por
       src/lib/tema.ts, que o rebranding reescreveu: classes do <html>, tokens
       e a cor da barra do navegador têm de sair como saíam. */
    id: "09-tema-alternado",
    preparar: async (page) => {
      /* A conta aberta no estado anterior cobre o cabeçalho, e no celular o
         aviso do envio (4,2 s na tela) fica por cima do botão: fecha a conta
         e deixa o aviso sair, como o cliente faria. */
      await page.getByRole("button", { name: "Fechar", exact: true }).first().click();
      await page.clock.runFor(5200);
      await page.getByRole("button", { name: /^Ativar tema/ }).first().click();
    },
  },
];

async function abrir(browser, base, vp, tema) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    colorScheme: tema === "escuro" ? "dark" : "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  await context.addInitScript((t) => {
    try { localStorage.setItem("qradmin-tema", t); } catch { /* storage bloqueado */ }
    /* O SSE é neutralizado: a prova mede aparência, não tempo real. */
    window.EventSource = class { addEventListener() {} close() {} };
  }, tema);
  await context.route("**/api/**", simularApi);
  const page = await context.newPage();
  await page.clock.install({ time: AGORA });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${base}/#/mesa/${TOKEN}`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Montar", exact: true }).first().waitFor({ timeout: 20000 });
  /* A partir daqui o tempo da página está parado no mesmo instante nos dois
     builds; cada estado avança exatamente os mesmos milissegundos. */
  await page.clock.pauseAt(new Date(AGORA.getTime() + 60_000));
  return { context, page, erros };
}

async function pixels(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, largura: info.width, altura: info.height };
}

async function diferencaDePixels(a, b, destino) {
  const [pa, pb] = await Promise.all([pixels(a), pixels(b)]);
  if (pa.largura !== pb.largura || pa.altura !== pb.altura) return { diferentes: -1, detalhe: `tamanho ${pa.largura}x${pa.altura} ≠ ${pb.largura}x${pb.altura}` };
  let diferentes = 0;
  let maiorDelta = 0;
  const mapa = Buffer.alloc(pa.data.length);
  for (let i = 0; i < pa.data.length; i += 4) {
    const delta = Math.max(Math.abs(pa.data[i] - pb.data[i]), Math.abs(pa.data[i + 1] - pb.data[i + 1]), Math.abs(pa.data[i + 2] - pb.data[i + 2]), Math.abs(pa.data[i + 3] - pb.data[i + 3]));
    const igual = delta === 0;
    if (!igual) { diferentes++; if (delta > maiorDelta) maiorDelta = delta; }
    mapa[i] = igual ? pa.data[i] : 255; mapa[i + 1] = igual ? pa.data[i + 1] : 0; mapa[i + 2] = igual ? pa.data[i + 2] : 255; mapa[i + 3] = igual ? 70 : 255;
  }
  if (diferentes && destino) await sharp(mapa, { raw: { width: pa.largura, height: pa.altura, channels: 4 } }).png().toFile(destino);
  return { diferentes, maiorDelta, total: pa.largura * pa.altura };
}

/* Compara dois retratos; devolve as divergências e os nós a detalhar. */
function diferencaDeRetrato(a, b) {
  const achados = [];
  for (const [nome, valor] of Object.entries(a.variaveis)) {
    if (b.variaveis[nome] !== valor) achados.push(`custom property ${nome}: "${valor}" → "${b.variaveis[nome] ?? "(não lida)"}"`);
  }
  for (const [nome, valor] of Object.entries(a.atributos)) {
    if (b.atributos[nome] !== valor) achados.push(`atributo ${nome}: "${valor}" → "${b.atributos[nome]}"`);
  }
  if (a.fontes.join("|") !== b.fontes.join("|")) achados.push(`fontes carregadas: [${a.fontes.join(", ")}] → [${b.fontes.join(", ")}]`);
  if (a.elementos.length !== b.elementos.length) achados.push(`número de elementos: ${a.elementos.length} → ${b.elementos.length}`);
  const porCaminho = new Map(b.elementos.map((e) => [e[0], e]));
  const detalhar = [];
  for (const [caminho, caixa, assinatura, marcacao] of a.elementos) {
    const eb = porCaminho.get(caminho);
    if (!eb) { achados.push(`elemento ausente no build atual: ${caminho}`); continue; }
    if (caixa !== eb[1]) achados.push(`caixa de ${caminho}: ${caixa} → ${eb[1]}`);
    if (assinatura !== eb[2] || marcacao !== eb[3]) detalhar.push(caminho);
  }
  return { achados, detalhar };
}

/* --- execução ------------------------------------------------------------------ */
const packed = (await import("@sparticuz/chromium")).default;
process.env.LD_LIBRARY_PATH ||= "/tmp/al2023/lib";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (await packed.executablePath()),
  /* Rasterização em CPU, sem GPU emulada: o SwiftShader reamostra fotos e
     pontilha gradientes de um jeito que varia de uma execução para outra, e a
     prova precisa que a mesma página dê sempre os mesmos pixels. */
  args: [
    ...packed.args.filter((a) => a !== "--single-process" && !/^--(use-gl|use-angle|enable-unsafe-swiftshader|ignore-gpu-blocklist|in-process-gpu)\b/.test(a)),
    "--disable-gpu",
    "--disable-gpu-rasterization",
    "--disable-gpu-compositing",
    "--force-color-profile=srgb",
  ],
  headless: true,
});

const servBase = await servir(distBase);
const servAtual = await servir(AUTOTESTE ? distBase : distAtual);
let falhas = 0;
const arquivos = conferirArquivos();
let comparados = 0;
let elementosMedidos = 0;
let atributosMedidos = 0;
let variaveisMedidas = 0;
let propriedadesPorElemento = 0;
let identicos = 0;
const maiorRuido = { pixels: 0, delta: 0 };
const maiorDesvio = { pixels: 0, delta: 0 };
/* Tolerância de pixels. O estilo computado, as caixas e as custom properties
   NÃO têm tolerância: precisam ser exatamente iguais. Já os pixels de fotos
   reduzidas variam de uma execução para outra no próprio Chromium (a base
   diverge de si mesma em poucas dezenas de pixels, nas bordas das fotos). A
   folga abaixo cobre só esse ruído: no máximo 0,02% do quadro, cada pixel com
   no máximo 16 níveis em 255. Uma troca de cor, fonte, raio ou espaçamento
   mexe em milhares de pixels e, antes disso, no estilo computado. */
const TOLERANCIA = { fracao: 0.0002, delta: 16 };
const saida = DIR_SAIDA ? path.resolve(DIR_SAIDA) : null;
const saidaFalha = path.join(RAIZ, ".cardapio-intacto");
if (saida) fs.mkdirSync(saida, { recursive: true });
try {
  console.log(`Base: ${baseRef} (${baseSha}) · ${AUTOTESTE ? "AUTOTESTE: base × base" : `comparando com ${path.relative(RAIZ, distAtual) || distAtual}/`}${SEM_REDESENHO ? " · SEM redesenho forçado" : ""}`);
  for (const achado of arquivos.achados) { falhas++; console.error(`FALHA  ${achado}`); }
  for (const vp of VIEWPORTS) {
    for (const tema of TEMAS) {
      /* Três páginas: a base, o build atual e um CONTROLE — a mesma base de
         novo. O controle mede quanto o navegador diverge de si mesmo. */
      const [a, b, c] = await Promise.all([abrir(browser, servBase.url, vp, tema), abrir(browser, servAtual.url, vp, tema), abrir(browser, servBase.url, vp, tema)]);
      for (const estado of ESTADOS) {
        const chave = `${estado.id}--${vp.id}--${tema}`;
        try {
          await Promise.all([estado.preparar(a.page, vp), estado.preparar(b.page, vp), estado.preparar(c.page, vp)]);
          await Promise.all([assentar(a.page, estado.avancar), assentar(b.page, estado.avancar), assentar(c.page, estado.avancar)]);
          /* O build atual é comparado com DUAS renderizações independentes
             da base (a base e o controle). O ruído de rasterização cai ora
             numa, ora noutra; a alteração de verdade apareceria contra as
             duas. Vale a comparação mais próxima. Se nenhuma sair idêntica,
             repete a captura (redecodificando as imagens) e fica com a melhor. */
          let pngA, pngB, pngC, px, ruido;
          for (let tentativa = 0; tentativa < 3; tentativa++) {
            const [novaA, novaB, novaC] = [await capturaEstavel(a.page), await capturaEstavel(b.page), await capturaEstavel(c.page)];
            const [contraBase, contraControle] = [await diferencaDePixels(novaA, novaB, null), await diferencaDePixels(novaC, novaB, null)];
            const usarControle = contraBase.diferentes < 0 || (contraControle.diferentes >= 0 && contraControle.diferentes < contraBase.diferentes);
            const melhor = usarControle ? contraControle : contraBase;
            if (!px || (melhor.diferentes >= 0 && (px.diferentes < 0 || melhor.diferentes < px.diferentes))) {
              px = melhor;
              [pngA, pngB, pngC] = [usarControle ? novaC : novaA, novaB, usarControle ? novaA : novaC];
              ruido = await diferencaDePixels(novaA, novaC, null);
            }
            if (px.diferentes === 0) break;
          }
          if (ruido.diferentes > maiorRuido.pixels) maiorRuido.pixels = ruido.diferentes;
          if (ruido.maiorDelta > maiorRuido.delta) maiorRuido.delta = ruido.maiorDelta;
          const ra = await a.page.evaluate(retratoDaPagina, { nomesDaBase: [], admitida: MARCACAO_ADMITIDA });
          const rb = await b.page.evaluate(retratoDaPagina, { nomesDaBase: ra.nomes, admitida: MARCACAO_ADMITIDA });
          /* A chave do isolamento tem de estar ligada no build atual (e só nele). */
          const chaveEsperada = AUTOTESTE ? "" : 'html[data-identidade="cardapio"]';
          const chaves = { base: ra.admitidaPresente.join(" "), atual: rb.admitidaPresente.join(" ") };
          comparados++;
          atributosMedidos += ra.atributosLidos;
          elementosMedidos += ra.elementos.length;
          variaveisMedidas += Object.keys(ra.variaveis).length;
          propriedadesPorElemento = ra.propriedades;
          if (saida) {
            fs.writeFileSync(path.join(saida, `${chave}--base.png`), pngA);
            fs.writeFileSync(path.join(saida, `${chave}--atual.png`), pngB);
          }
          const { achados, detalhar } = diferencaDeRetrato(ra, rb);
          if (chaves.base !== "") achados.push(`a base não deveria ter a chave de identidade, mas tem: ${chaves.base}`);
          if (chaves.atual !== chaveEsperada) achados.push(`chave de identidade no build atual: esperado "${chaveEsperada}", lido "${chaves.atual}"`);
          if (detalhar.length) {
            const alvo = detalhar.slice(0, 40);
            const pedido = { caminhos: alvo, admitida: MARCACAO_ADMITIDA };
            const [da, db] = [await a.page.evaluate(detalharElementos, pedido), await b.page.evaluate(detalharElementos, pedido)];
            for (const caminho of alvo) {
              const ea = da[caminho], eb = db[caminho];
              if (!ea || !eb) { achados.push(`${caminho}: nó sumiu ao detalhar`); continue; }
              for (const prop of new Set([...Object.keys(ea.estilo), ...Object.keys(eb.estilo)])) {
                if (ea.estilo[prop] !== eb.estilo[prop]) achados.push(`${ea.rotulo} ${caminho} { ${prop}: ${ea.estilo[prop]} → ${eb.estilo[prop]} }`);
              }
              for (const item of new Set([...Object.keys(ea.marcacao), ...Object.keys(eb.marcacao)])) {
                if (ea.marcacao[item] !== eb.marcacao[item]) achados.push(`marcação de ${ea.rotulo} ${caminho} · ${item}: ${JSON.stringify(ea.marcacao[item] ?? null)} → ${JSON.stringify(eb.marcacao[item] ?? null)}`);
              }
            }
            if (detalhar.length > alvo.length) achados.push(`… e mais ${detalhar.length - alvo.length} elementos com estilo diferente`);
          }
          const identico = px.diferentes === 0;
          const dentroDoRuido = px.diferentes > 0 && px.diferentes <= Math.ceil(px.total * TOLERANCIA.fracao) && px.maiorDelta <= TOLERANCIA.delta;
          if (px.diferentes > maiorDesvio.pixels) maiorDesvio.pixels = px.diferentes;
          if (px.maiorDelta > maiorDesvio.delta) maiorDesvio.delta = px.maiorDelta;
          if ((identico || dentroDoRuido) && achados.length === 0) {
            if (identico) identicos++;
            const pixelsTxt = identico ? `${px.total} pixels idênticos` : `${px.diferentes} de ${px.total} pixels com diferença de até ${px.maiorDelta}/255`;
            const ruidoTxt = ruido.diferentes === 0 ? "base × base: idênticos" : `base × base: ${ruido.diferentes} pixels, até ${ruido.maiorDelta}/255`;
            console.log(`OK     ${chave}: ${pixelsTxt} (${ruidoTxt}) · ${ra.elementos.length} elementos · ${Object.keys(ra.variaveis).length} custom properties`);
            continue;
          }
          falhas++;
          fs.mkdirSync(saidaFalha, { recursive: true });
          fs.writeFileSync(path.join(saidaFalha, `${chave}--base.png`), pngA);
          fs.writeFileSync(path.join(saidaFalha, `${chave}--atual.png`), pngB);
          await diferencaDePixels(pngA, pngB, path.join(saidaFalha, `${chave}--diff.png`));
          console.error(`FALHA  ${chave}: ${px.diferentes < 0 ? px.detalhe : `${px.diferentes} de ${px.total} pixels diferentes (até ${px.maiorDelta}/255; base × base: ${ruido.diferentes} pixels, até ${ruido.maiorDelta}/255)`} · ${achados.length} diferenças de estilo`);
          for (const linha of achados.slice(0, 14)) console.error(`         ${linha}`);
          if (achados.length > 14) console.error(`         … e mais ${achados.length - 14}`);
        } catch (erro) {
          falhas++;
          console.error(`FALHA  ${chave}: não foi possível reproduzir o estado — ${String(erro.message || erro).split("\n")[0]}`);
          break;
        }
      }
      for (const [rotulo, lado] of [["base", a], ["atual", b], ["base (controle)", c]]) {
        if (lado.erros.length) { falhas++; console.error(`FALHA  ${vp.id}/${tema}: erro de página no build ${rotulo}: ${lado.erros.join(" | ")}`); }
        await lado.context.close();
      }
    }
  }
  /* Imagens e fontes baixadas: mesmos bytes nos dois builds. O caminho pode
     mudar (as fontes do cardápio passaram a ser empacotadas pelo Vite); o
     conteúdo, não. Código (JS, CSS, HTML) fica de fora: é o que foi reescrito. */
  const baixados = (servidor) => {
    const itens = new Map();
    for (const [caminho, sha] of servidor.pedidos) {
      const ext = path.extname(caminho).toLowerCase();
      if ([".js", ".mjs", ".css", ".html", ""].includes(ext)) continue;
      const chave = `${ext} ${sha}`;
      if (!itens.has(chave)) itens.set(chave, caminho);
    }
    return itens;
  };
  const [baixadosBase, baixadosAtual] = [baixados(servBase), baixados(servAtual)];
  for (const [chave, caminho] of baixadosBase) {
    if (!baixadosAtual.has(chave)) { falhas++; console.error(`FALHA  o cardápio da base baixa ${caminho} (${chave.split(" ")[1].slice(0, 12)}) e o build atual não baixa nada com esses bytes`); }
  }
  for (const [chave, caminho] of baixadosAtual) {
    if (!baixadosBase.has(chave)) { falhas++; console.error(`FALHA  o build atual baixa ${caminho} (${chave.split(" ")[1].slice(0, 12)}), que a base não baixava com esses bytes`); }
  }
  const esperados = VIEWPORTS.length * TEMAS.length * ESTADOS.length;
  if (comparados < esperados) {
    falhas++;
    console.error(`FALHA  esperados ${esperados} estados, comparados ${comparados}.`);
  }
  console.log(
    falhas
      ? `\n${falhas} FALHA(S). Capturas e mapas de diferença em .cardapio-intacto/`
      : [
          "",
          `Cardápio do cliente intacto (${comparados} estados conferidos contra ${baseSha}):`,
          `  marcação . ${elementosMedidos} elementos, ${atributosMedidos} atributos e todos os textos: nenhuma diferença` +
            (AUTOTESTE ? "." : ` (admitidos só no <html>: a chave data-identidade="cardapio" e os tokens que saíram do style inline).`),
          `  estilo ... ${elementosMedidos} elementos × ${propriedadesPorElemento} propriedades computadas, caixas de layout e ${variaveisMedidas} custom properties: nenhuma diferença.`,
          `  pixels ... ${identicos} de ${comparados} estados idênticos pixel a pixel` +
            (identicos < comparados ? `; nos outros ${comparados - identicos}, no máximo ${maiorDesvio.pixels} pixels por tela, com até ${maiorDesvio.delta}/255 de diferença.` : "."),
          `  downloads  ${baixadosBase.size} imagens e fontes pedidas pelo cardápio: mesmos bytes nos dois builds.`,
          `  arquivos . ${arquivos.exclusivos.length} arquivos exclusivos do cardápio (tela, estilo e páginas legadas com o que carregam): idênticos à base.`,
          `             dos ${arquivos.grafo.length} módulos compartilhados que também desenham o cardápio, ${arquivos.alterados.length} mudaram` +
            (arquivos.alterados.length ? `: ${arquivos.alterados.join(", ")}. O efeito deles é o que as linhas acima medem.` : "."),
          `  ruído .... a base comparada com ela mesma, na mesma execução, divergiu em até ${maiorRuido.pixels} pixels por tela (até ${maiorRuido.delta}/255).`,
          `  folga .... ${TOLERANCIA.fracao * 100}% do quadro e ${TOLERANCIA.delta}/255 por pixel, só para os pixels; estilo não tem folga.`,
        ].join("\n"),
  );
} finally {
  await browser.close();
  servBase.fechar();
  servAtual.fechar();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(falhas ? 1 : 0);
