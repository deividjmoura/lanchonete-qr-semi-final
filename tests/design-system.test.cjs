"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const read = (p) => fs.readFileSync(p, "utf8");
const tokens = read("public/garcom-pwa/design-tokens.css");

const { temaResolvido, superficieDoCardapio, contraste: contrast, misturar, blocos } = require("./helpers/tokens.cjs");

// Tokens de cada tema com as referências var(--x) já resolvidas.
const light = temaResolvido("claro");
const dark = temaResolvido("escuro");

test("React e PWA importam fonte única de tokens, override completo do Tailwind e bootstrap compartilhado", () => {
  const spaCss = read("src/index.css");
  assert.match(spaCss, /@import "\.\.\/public\/garcom-pwa\/design-tokens\.css"/);
  assert.match(spaCss, /--color-\*:\s*initial/);
  assert.match(spaCss, /--radius-\*:\s*initial/);
  assert.match(spaCss, /--shadow-\*:\s*initial/);
  assert.match(spaCss, /--font-\*:\s*initial/);
  assert.match(read("public/garcom-pwa/styles.css"), /@import "\.\/design-tokens\.css"/);
  assert.match(read("index.html"), /src="\/garcom-pwa\/theme-init\.js"/);
  assert.match(read("public/garcom-pwa/index.html"), /src="\.\/theme-init\.js"/);
  assert.match(tokens, /prefers-color-scheme: dark/);
  assert.match(tokens, /:not\(\[data-theme="claro"\]\)/);
  assert.doesNotMatch(tokens, /#ffffff\b|#fff\b|#000000\b|#000\b/i, "proibido branco ou preto puros nos tokens");
});

test("tema.ts não escreve token inline: a folha de estilo é a única dona dos valores", () => {
  const code = ts.transpileModule(read("src/lib/tema.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const themeName of ["claro", "escuro"]) {
    const values = {};
    const meta = {};
    const root = {
      style: {
        setProperty(k, v) {
          values[k] = v;
        },
      },
      setAttribute() {},
      getAttribute() {
        return null;
      },
      classList: { toggle() {} },
    };
    const context = {
      exports: {},
      document: {
        documentElement: root,
        querySelector() {
          return { setAttribute: (k, v) => (meta[k] = v) };
        },
      },
      getComputedStyle: () => ({ getPropertyValue: (nome) => (nome === "--surface" ? (themeName === "claro" ? light : dark)["--surface"] : "") }),
      localStorage: { setItem() {}, getItem() { return null; } },
      window: { dispatchEvent() {} },
      CustomEvent: class {},
    };
    vm.runInNewContext(code, context);
    context.exports.aplicarTema(themeName);
    // Token inline no <html> vence a folha de estilo: travaria a troca de tema
    // e apagaria a identidade própria do cardápio do cliente.
    assert.deepEqual(values, {}, `${themeName}: aplicarTema não fixa tokens inline`);
    assert.equal(meta.content, (themeName === "claro" ? light : dark)["--surface"], `${themeName}: theme-color lê o --surface computado`);
  }
  assert.doesNotMatch(read("src/lib/tema.ts"), /style\.setProperty\(\s*["'`]--/);
});

test("cores repetidas fora do CSS acompanham os tokens (barra do navegador, manifest e QR Code)", () => {
  const cardapio = superficieDoCardapio();
  const script = read("public/garcom-pwa/theme-init.js");
  // theme-init.js roda antes de o CSS carregar: os quatro literais dele têm de
  // ser o --surface de cada identidade em cada tema.
  for (const [hash, pathname, esperado] of [
    ["#/dashboard", "/", { claro: light["--surface"], escuro: dark["--surface"] }],
    ["#/mesa/abc", "/", cardapio],
    ["", "/garcom-pwa/", { claro: light["--surface"], escuro: dark["--surface"] }],
    ["#/mesa/abc", "/garcom-pwa/", { claro: light["--surface"], escuro: dark["--surface"] }],
  ]) {
    for (const tema of ["claro", "escuro"]) {
      const meta = {};
      const root = { style: {}, setAttribute() {}, classList: { toggle() {} } };
      vm.runInNewContext(script, {
        document: {
          documentElement: root,
          querySelector: (seletor) => (seletor === 'meta[name="theme-color"]' ? { setAttribute: (k, v) => (meta[k] = v) } : null),
        },
        localStorage: { getItem: () => tema },
        location: { hash, pathname },
        window: {},
      });
      assert.equal(meta.content, esperado[tema], `theme-init em ${pathname}${hash} (${tema})`);
    }
  }
  // Valor escrito no HTML para o primeiro instante, antes de qualquer script.
  assert.match(read("index.html"), new RegExp(`<meta name="theme-color" content="${light["--surface"]}"`));
  assert.match(read("public/garcom-pwa/index.html"), new RegExp(`<meta name="theme-color" content="${light["--surface"]}"`));
  // O PWA troca a cor da barra ao alternar o tema.
  const app = read("public/garcom-pwa/app.js");
  assert.ok(
    app.includes(`meta.setAttribute('content',next==='escuro'?'${dark["--surface"]}':'${light["--surface"]}')`),
    "app.js do PWA usa o --surface de cada tema na barra do navegador",
  );
  // Instalação do PWA: fundo da abertura = papel; cor do sistema = tinta da marca.
  const manifest = JSON.parse(read("public/garcom-pwa/manifest.webmanifest"));
  assert.equal(manifest.background_color, light["--surface"]);
  assert.equal(manifest.theme_color, blocos().primitivos.get("--passe-tinta-700"));
  // O QR Code é desenhado em SVG com cores fixas (precisa ser lido por câmera
  // nos dois temas): os literais de tema.ts são os tokens --qr-*.
  const tema = read("src/lib/tema.ts");
  const qr = /QR_SVG_COLORS = \{\s*fg: "(#[0-9a-f]{6})",\s*bg: "(#[0-9a-f]{6})",\s*\}/.exec(tema);
  assert.ok(qr, "QR_SVG_COLORS precisa existir em src/lib/tema.ts");
  for (const t of [light, dark]) {
    assert.equal(qr[1], t["--qr-ink"], "QR_SVG_COLORS.fg = --qr-ink");
    assert.equal(qr[2], t["--qr-paper"], "QR_SVG_COLORS.bg = --qr-paper");
  }
  assert.ok(contrast(qr[1], qr[2]) >= 12, "o QR Code mantém contraste alto para a câmera");
});

test("tokens semânticos atendem contraste WCAG AA nos dois temas", () => {
  for (const [label, theme] of [
    ["claro", light],
    ["escuro", dark],
  ]) {
    const par = (a, b) => contrast(misturar(theme[a]), misturar(theme[b]));
    assert.ok(par("--text", "--surface") >= 7, `${label}: --text sobre --surface`);
    assert.ok(par("--text", "--surface-raised") >= 7, `${label}: --text sobre --surface-raised`);
    assert.ok(par("--text", "--surface-sunken") >= 7, `${label}: --text sobre --surface-sunken`);
    assert.ok(par("--text-muted", "--surface-raised") >= 4.5, `${label}: --text-muted`);
    assert.ok(par("--text-muted", "--surface") >= 4.5, `${label}: --text-muted sobre a página`);
    assert.ok(par("--text-muted", "--surface-sunken") >= 4.5, `${label}: --text-muted sobre --surface-sunken`);
    assert.ok(par("--text-subtle", "--surface-raised") >= 4.5, `${label}: --text-subtle`);
    assert.ok(par("--text-subtle", "--surface") >= 4.5, `${label}: --text-subtle sobre a página`);
    assert.ok(par("--brand", "--brand-contrast") >= 4.5, `${label}: botão primário`);
    assert.ok(par("--brand-hover", "--brand-contrast") >= 4.5, `${label}: botão primário em hover`);
    assert.ok(par("--brand-ink", "--surface-raised") >= 4.5, `${label}: --brand-ink`);
    assert.ok(par("--brand-ink", "--surface") >= 4.5, `${label}: --brand-ink sobre a página`);
    assert.ok(par("--brand-ink", "--brand-surface") >= 4.5, `${label}: --brand-ink sobre --brand-surface`);
    assert.ok(par("--accent-ink", "--surface-raised") >= 4.5, `${label}: --accent-ink`);
    assert.ok(par("--accent-ink", "--accent-surface") >= 4.5, `${label}: --accent-ink sobre --accent-surface`);
    for (const estado of ["success", "warning", "info", "danger"]) {
      assert.ok(par(`--status-${estado}-ink`, "--surface-raised") >= 4.5, `${label}: ${estado}-ink`);
      assert.ok(par(`--status-${estado}-ink`, "--surface") >= 4.5, `${label}: ${estado}-ink sobre a página`);
      assert.ok(par(`--status-${estado}-ink`, `--status-${estado}-surface`) >= 4.5, `${label}: ${estado}-ink sobre a própria superfície`);
      assert.ok(par(`--status-${estado}`, `--status-${estado}-contrast`) >= 4.5, `${label}: texto sobre o estado ${estado} cheio`);
    }
    // Plaquinha da mesa: número e rótulo.
    assert.ok(par("--plaque-text", "--plaque") >= 7, `${label}: número da plaquinha`);
    assert.ok(par("--plaque-label", "--plaque") >= 4.5, `${label}: rótulo da plaquinha`);
    // Faixa de tinta (barra lateral e rodapé do PWA).
    assert.ok(par("--ink-band-text", "--ink-band") >= 7, `${label}: texto na faixa de tinta`);
    assert.ok(par("--ink-band-muted", "--ink-band") >= 4.5, `${label}: texto secundário na faixa de tinta`);
    assert.ok(par("--ink-band-signal", "--ink-band") >= 4.5, `${label}: sinal na faixa de tinta`);
    assert.ok(par("--ink-band-text", "--ink-band-raised") >= 7, `${label}: texto na estação ativa`);
    // Contorno de campo e foco precisam de 3:1 contra o fundo (WCAG 1.4.11).
    assert.ok(par("--line-strong", "--surface-raised") >= 3, `${label}: contorno de campo`);
    assert.ok(par("--line-strong", "--surface") >= 3, `${label}: contorno de campo sobre a página`);
    assert.ok(par("--focus-ring", "--surface-raised") >= 3, `${label}: anel de foco`);
    assert.ok(par("--focus-ring", "--surface") >= 3, `${label}: anel de foco sobre a página`);
    // Papel do QR Code: tinta escura sobre papel claro nos dois temas.
    assert.ok(par("--qr-ink", "--qr-paper") >= 12, `${label}: QR Code`);
  }
});

test("PWA concentra conexão, sincronização, tema, avisos e ajuda no rodapé, com sprite Phosphor", () => {
  const pwaHtml = read("public/garcom-pwa/index.html");
  const syncMatches = pwaHtml.match(/id="syncBtn"/g) || [];
  assert.equal(syncMatches.length, 1, "deve existir exatamente um botão de sincronização");
  assert.doesNotMatch(pwaHtml, /class="app-header"/, "a faixa superior fixa foi removida");
  const footer = pwaHtml.slice(pwaHtml.indexOf('<footer class="app-footer"'), pwaHtml.indexOf("</footer>"));
  assert.match(footer, /class="bottom-nav"/, "navegação continua no rodapé");
  assert.doesNotMatch(footer, /class="utility-bar"/, "utilitários não ficam no rodapé fixo");
  const mesas = pwaHtml.slice(pwaHtml.indexOf('id="page-tables"'), pwaHtml.indexOf('id="page-orders"'));
  for (const id of ["connection", "syncBtn", "themeToggleBtn", "helpBtn", "openNotificationSettings"]) {
    assert.match(mesas, new RegExp('id="' + id + '"'), id + " fica na aba Mesas");
  }
  assert.match(pwaHtml, /icons\.svg#squares-four-regular/);
  assert.match(pwaHtml, /icons\.svg#squares-four-fill/);
});

test("PWA renderiza múltiplos pedidos recolhidos por padrão com expansão inline em acordeão", async () => {
  const { contexto, carregar, Elemento } = require("./helpers/pwa-harness.cjs");
  const root = new Elemento("div");
  const ctx = contexto({
    ids: { readyOrders: root, alertMessage: new Elemento("p") },
    globais: {
      waiterToken: "tok",
      currentWaiterId: 7,
      getJson: async () => [
        { id: 101, mesa: 4, responsavelMesaNome: "Deivid", criado_em: "2026-10-30T18:10:00Z", itens: [{ id: 1, status: "concluido", nome: "Chopp", quantidade: 2, setor: "bar" }] },
        { id: 102, mesa: 9, responsavelMesaNome: "Ana", criado_em: "2026-10-30T18:15:00Z", itens: [{ id: 2, status: "concluido", nome: "Burger", quantidade: 1, setor: "cozinha" }] },
      ],
      refreshLiveData: async () => {},
      itemStateText: (i) => i.status,
      showOrderHistory: () => {},
    },
  });
  carregar(ctx, ["avisarEntrega", "deliveryAction", "loadDeliveries"]);
  await ctx.loadDeliveries();

  assert.equal(root.children.length, 2, "dois cards na fila");
  const [card1, card2] = root.children;
  const [sum1, body1] = card1.children;
  const [sum2, body2] = card2.children;
  assert.equal(body1.hidden, true, "pedido 1 inicia recolhido quando há vários pedidos");
  assert.equal(body2.hidden, true, "pedido 2 inicia recolhido quando há vários pedidos");
  assert.equal(sum1.attributes["aria-expanded"], "false");

  // Tocar no primeiro expande
  sum1.onclick();
  assert.equal(body1.hidden, false);
  assert.equal(sum1.attributes["aria-expanded"], "true");

  // Tocar no segundo expande o segundo e recolhe o primeiro
  sum2.onclick();
  assert.equal(body1.hidden, true, "evita múltiplos pedidos expandidos simultaneamente");
  assert.equal(body2.hidden, false);
  assert.equal(sum2.attributes["aria-expanded"], "true");

  // Tocar novamente recolhe
  sum2.onclick();
  assert.equal(body2.hidden, true);
  assert.equal(sum2.attributes["aria-expanded"], "false");
});


test("fonte Archivo (até 100 KB), cantos curtos e sprite Phosphor fazem parte do shell offline", () => {
  const sw = read("public/garcom-pwa/sw.js");
  for (const asset of [
    "design-tokens.css",
    "theme-init.js",
    "icons.svg",
    "fonts/archivo-latin-wdth-normal.woff2",
    "brand-mark.webp",
    "brand-wordmark.webp",
  ]) {
    assert.ok(sw.includes("'./" + asset + "'"), asset + " está no precache");
    assert.ok(fs.existsSync("public/garcom-pwa/" + asset), asset + " existe");
  }
  // Nada no precache aponta para arquivo que não existe (um 404 derruba a
  // instalação inteira do service worker).
  const lista = /const SHELL=\[([^\]]*)\]/.exec(sw);
  assert.ok(lista, "lista SHELL do service worker");
  for (const item of lista[1].match(/'[^']+'/g).map((x) => x.slice(1, -1))) {
    if (item === "./") continue;
    assert.ok(fs.existsSync(require("node:path").join("public/garcom-pwa", item)), `${item} do precache existe`);
  }
  const fontBytes = fs.statSync("public/garcom-pwa/fonts/archivo-latin-wdth-normal.woff2").size;
  assert.ok(fontBytes <= 100 * 1024, `orçamento de fontes respeitado (${fontBytes} bytes)`);
  assert.match(tokens, /font-display:\s*swap/);
  assert.match(tokens, /--radius-md:\s*8px/);
  assert.match(tokens, /--radius-lg:\s*10px/);
  assert.doesNotMatch(read("index.html"), /fonts\.googleapis\.com/);
  assert.ok(fs.existsSync("docs/DESIGN_SYSTEM.md"), "docs/DESIGN_SYSTEM.md existe");
});

test("correções de bugs pré-existentes: MIME .woff2, print.ts sem debíto, Admin sem Pexels/estoqueMin=5 fixo e SW update ativo", () => {
  const serverSrc = read("server.js");
  assert.match(serverSrc, /'\.woff2':\s*'font\/woff2'/);
  assert.match(serverSrc, /'\.woff':\s*'font\/woff'/);
  assert.match(serverSrc, /'\.ico':\s*'image\/x-icon'/);

  const printSrc = read("src/lib/print.ts");
  assert.doesNotMatch(printSrc, /debíto/, "typo debíto removido de print.ts");
  const printJs = ts.transpileModule(printSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  let capturedHtml = "";
  const docStub = {
    open() {},
    write(h) {
      capturedHtml = h;
    },
    close() {},
  };
  const printCtx = {
    exports: {},
    require: () => ({ BRL: (v) => "R$ " + Number(v || 0).toFixed(2) }),
    setTimeout: () => 0,
    document: {
      createElement() {
        return {
          style: {},
          setAttribute() {},
          remove() {},
          contentDocument: docStub,
          contentWindow: { document: docStub, focus() {}, print() {} },
        };
      },
      body: { appendChild() {} },
    },
  };
  vm.runInNewContext(printJs, printCtx);
  printCtx.exports.imprimirComprovanteConsumo({
    id: 10,
    mesa: 4,
    abertaEm: "2026-10-30T18:00:00Z",
    fechadaEm: "2026-10-30T19:00:00Z",
    totalConsumo: 12,
    desconto: 0,
    taxa: 0,
    valorCobrado: 12,
    valorPago: 12,
    saldo: 0,
    itens: [{ nome: "Chopp", quantidade: 1, precoUnitario: 12, adicionais: 0, total: 12, pedidoId: 1 }],
    pagamentos: [
      { id: 1, valor: 6, forma: "débito", criadoEm: "2026-10-30T19:00:00Z" },
      { id: 2, valor: 6, forma: "crédito", criadoEm: "2026-10-30T19:00:00Z" },
    ],
  });
  assert.match(capturedHtml, /Cartão débito/);
  assert.match(capturedHtml, /Cartão crédito/);

  const adminSrc = read("src/screens/Admin.tsx");
  assert.doesNotMatch(adminSrc, /pexels\.com/i, "Admin não usa fallback externo do Pexels");
  assert.match(adminSrc, /fotoDemo\(nome\.trim\(\),\s*categoria\)/, "Admin usa fallback local fotoDemo");
  assert.doesNotMatch(adminSrc, /useState\("5"\)/, "estoqueMin não inicia com '5' hardcoded");
  assert.match(adminSrc, /produto\.estoqueMinimo/, "Admin carrega estoqueMinimo real ao editar produto");

  const usePubSrc = read("src/store/usePub.ts");
  assert.doesNotMatch(usePubSrc, /estoqueMinimo:\s*p\.estoque\s*!=\s*null\s*\?\s*5\s*:\s*0/);
  assert.match(usePubSrc, /p\.estoqueMinimo/);

  // Regressões estruturais já saneadas no redesign
  const caixaSrc = read("src/screens/Caixa.tsx");
  assert.doesNotMatch(caixaSrc, /<h1[^>]*>[\s\S]*?<p[\s>]/, "Caixa não aninha <p> dentro de <h1>");
  assert.doesNotMatch(read("public/garcom-pwa/index.html"), /repeat\(5,/, "PWA bottom-nav não usa 5 colunas órfãs");
  assert.doesNotMatch(read("src/screens/Mesa.tsx"), /\?\s*null\s*:\s*null/, "Mesa não possui ternário morto");

  // Atualização ativa do Service Worker em aparelhos já instalados
  const pwaApp = read("public/garcom-pwa/app.js");
  assert.match(pwaApp, /updateViaCache:\s*'none'/);
  assert.match(pwaApp, /swReg\?\.update\(\)/);
});


test("Modal React é renderizado em portal e centralizado na viewport", () => {
  const ui = read("src/components/ui.tsx");
  const modal = ui.slice(ui.indexOf("export function Modal("), ui.indexOf("\nexport function Qtd"));
  assert.match(ui, /import \{ createPortal \} from "react-dom"/);
  assert.match(modal, /createPortal\(/);
  assert.match(modal, /setPortalRoot\(document\.body\)/);
  assert.match(modal, /fixed inset-0 z-\[100\] flex items-center justify-center/);
  assert.match(modal, /max-h-\[calc\(100dvh-24px\)\]/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /e\.key === "Escape"/);
});
