"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const read = (p) => fs.readFileSync(p, "utf8");
const tokens = read("public/garcom-pwa/design-tokens.css");

function extractVars(block) {
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const primBlock = tokens.slice(0, tokens.indexOf('[data-theme="claro"]'));
const lightBlock = tokens.slice(
  tokens.indexOf('[data-theme="claro"]'),
  tokens.indexOf("@media (prefers-color-scheme: dark)"),
);
const darkBlock = tokens.slice(tokens.indexOf(':root[data-theme="escuro"]'));

const primitives = extractVars(primBlock);
const resolveVar = (val) => {
  const m = /^var\((--[\w-]+)\)$/.exec(val || "");
  return m ? primitives[m[1]] || val : val;
};
const light = Object.fromEntries(
  Object.entries(extractVars(lightBlock)).map(([k, v]) => [k, resolveVar(v)]),
);
const dark = Object.fromEntries(
  Object.entries(extractVars(darkBlock)).map(([k, v]) => [k, resolveVar(v)]),
);

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

test("fallbacks inline do React e theme-init não divergem dos tokens semânticos compartilhados", () => {
  const code = ts.transpileModule(read("src/lib/tema.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const [themeName, expected] of [
    ["claro", light],
    ["escuro", dark],
  ]) {
    const values = {};
    const context = {
      exports: {},
      document: {
        documentElement: {
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
        },
        querySelector() {
          return null;
        },
      },
      localStorage: { setItem() {}, getItem() { return null; } },
      window: { dispatchEvent() {} },
      CustomEvent: class {},
    };
    vm.runInNewContext(code, context);
    context.exports.aplicarTema(themeName);
    for (const [key, value] of Object.entries(values)) {
      assert.equal(value.toLowerCase(), String(expected[key]).toLowerCase(), `${themeName}: ${key}`);
    }
  }
});

function luminance(hex) {
  const values = hex
    .replace("#", "")
    .match(/../g)
    .map((c) => parseInt(c, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test("tokens semânticos atendem contraste WCAG AA nos dois temas", () => {
  for (const [label, theme] of [
    ["claro", light],
    ["escuro", dark],
  ]) {
    assert.ok(contrast(theme["--text"], theme["--surface"]) >= 7, `${label}: --text sobre --surface`);
    assert.ok(contrast(theme["--text"], theme["--surface-raised"]) >= 7, `${label}: --text sobre --surface-raised`);
    assert.ok(contrast(theme["--text-muted"], theme["--surface-raised"]) >= 4.5, `${label}: --text-muted`);
    assert.ok(contrast(theme["--brand"], theme["--brand-contrast"]) >= 4.5, `${label}: botão primário`);
    assert.ok(contrast(theme["--brand-ink"], theme["--surface-raised"]) >= 4.5, `${label}: --brand-ink`);
    assert.ok(contrast(theme["--status-success-ink"], theme["--surface-raised"]) >= 4.5, `${label}: success-ink`);
    assert.ok(contrast(theme["--status-warning-ink"], theme["--surface-raised"]) >= 4.5, `${label}: warning-ink`);
    assert.ok(contrast(theme["--status-info-ink"], theme["--surface-raised"]) >= 4.5, `${label}: info-ink`);
    assert.ok(contrast(theme["--status-danger-ink"], theme["--surface-raised"]) >= 4.5, `${label}: danger-ink`);
  }
});

test("PWA implementa ação única de sincronização no cabeçalho, faixa compacta do garçom e sprite Phosphor", () => {
  const pwaHtml = read("public/garcom-pwa/index.html");
  const pwaCss = read("public/garcom-pwa/styles.css");
  const syncMatches = pwaHtml.match(/id="syncBtn"/g) || [];
  assert.equal(syncMatches.length, 1, "deve existir exatamente um botão de sincronização");
  assert.match(
    pwaHtml,
    /id="connection"[\s\S]{0,160}id="syncBtn"[^>]*aria-label="[^"]+"[^>]*title="[^"]+"/,
    "#syncBtn precisa ficar imediatamente à direita do indicador de conexão no cabeçalho global",
  );
  assert.doesNotMatch(
    pwaHtml.slice(pwaHtml.indexOf('<main class="workspace">')),
    /Sincronizar/i,
    "nenhum botão visual Sincronizar repetido nas páginas individuais",
  );
  assert.match(pwaHtml, /class="waiter-strip"/, "identificação compacta do garçom");
  assert.match(pwaCss, /\.waiter-strip-inner\s*\{[^}]*min-height:\s*28px/);
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


test("fontes Fraunces + Plus Jakarta Sans + JetBrains Mono (~150 KB máx), cantos suaves e sprite Phosphor fazem parte do shell offline", () => {
  const sw = read("public/garcom-pwa/sw.js");
  for (const asset of [
    "design-tokens.css",
    "theme-init.js",
    "icons.svg",
    "fonts/fraunces-latin-soft-normal.woff2",
    "fonts/plus-jakarta-sans-latin-wght-normal.woff2",
    "fonts/jetbrains-mono-latin-wght-normal.woff2",
    "brand-mark.webp",
    "brand-wordmark.webp",
  ]) {
    assert.ok(sw.includes("'./" + asset + "'"), asset + " está no precache");
    assert.ok(fs.existsSync("public/garcom-pwa/" + asset), asset + " existe");
  }
  const fontBytes =
    fs.statSync("public/garcom-pwa/fonts/fraunces-latin-soft-normal.woff2").size +
    fs.statSync("public/garcom-pwa/fonts/plus-jakarta-sans-latin-wght-normal.woff2").size +
    fs.statSync("public/garcom-pwa/fonts/jetbrains-mono-latin-wght-normal.woff2").size;
  assert.ok(fontBytes <= 155 * 1024, `orçamento de fontes respeitado (${fontBytes} bytes)`);
  assert.match(tokens, /font-display:\s*swap/);
  assert.match(tokens, /--radius-md:\s*20px/);
  assert.match(tokens, /--radius-lg:\s*24px/);
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

