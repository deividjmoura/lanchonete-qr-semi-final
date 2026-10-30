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

test("fontes Archivo + Martian Mono (~150 KB máx) e sprite de ícones Phosphor fazem parte do shell offline", () => {
  const sw = read("public/garcom-pwa/sw.js");
  for (const asset of [
    "design-tokens.css",
    "theme-init.js",
    "icons.svg",
    "fonts/archivo-latin-wdth-normal.woff2",
    "fonts/martian-mono-latin-wght-normal.woff2",
    "brand-mark.webp",
    "brand-wordmark.webp",
  ]) {
    assert.ok(sw.includes("'./" + asset + "'"), asset + " está no precache");
    assert.ok(fs.existsSync("public/garcom-pwa/" + asset), asset + " existe");
  }
  const fontBytes =
    fs.statSync("public/garcom-pwa/fonts/archivo-latin-wdth-normal.woff2").size +
    fs.statSync("public/garcom-pwa/fonts/martian-mono-latin-wght-normal.woff2").size;
  assert.ok(fontBytes <= 155 * 1024, `orçamento de fontes respeitado (${fontBytes} bytes)`);
  assert.match(tokens, /font-display:\s*swap/);
  assert.doesNotMatch(read("index.html"), /fonts\.googleapis\.com/);
  assert.ok(fs.existsSync("docs/DESIGN_SYSTEM.md"), "docs/DESIGN_SYSTEM.md existe");
});
