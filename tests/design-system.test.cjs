"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const read = (p) => fs.readFileSync(p, "utf8");
const tokens = read("public/garcom-pwa/design-tokens.css");

function palette(source) {
  return Object.fromEntries(
    [...source.matchAll(/(--qr-[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}
const light = palette(tokens.slice(0, tokens.indexOf("@media")));
const dark = palette(
  tokens.slice(
    tokens.indexOf("@media"),
    tokens.indexOf(':root[data-theme="escuro"]'),
  ),
);

test("React e PWA importam uma única fonte de tokens e o mesmo bootstrap", () => {
  assert.match(
    read("src/index.css"),
    /@import "\.\.\/public\/garcom-pwa\/design-tokens.css"/,
  );
  assert.match(
    read("public/garcom-pwa/styles.css"),
    /@import "\.\/design-tokens.css"/,
  );
  assert.match(read("index.html"), /src="\/garcom-pwa\/theme-init.js"/);
  assert.match(read("public/garcom-pwa/index.html"), /src="\.\/theme-init.js"/);
  assert.match(tokens, /prefers-color-scheme: dark/);
  assert.match(tokens, /:not\(\[data-theme="claro"\]\)/);
});

test("fallbacks inline do React não divergem dos tokens compartilhados", () => {
  const code = ts.transpileModule(read("src/lib/tema.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const [theme, expected] of [
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
          classList: { toggle() {} },
        },
        querySelector() {},
      },
      localStorage: { setItem() {} },
      window: { dispatchEvent() {} },
      CustomEvent: class {},
    };
    vm.runInNewContext(code, context);
    context.exports.aplicarTema(theme);
    const normalize = (v) =>
      v.replace(/\s/g, "").replace(/(^|[,(])0\./g, "$1.");
    for (const [key, value] of Object.entries(values))
      assert.equal(
        normalize(value),
        normalize(expected[key]),
        theme + ": " + key,
      );
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
  const [x, y] = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (x + 0.05) / (y + 0.05);
}
test("preenchimentos ativos mantêm contraste AA com branco, nos dois temas", () => {
  for (const key of ["--qr-action", "--qr-success-action"])
    assert.ok(contrast(light[key], light["--qr-on-action"]) >= 4.5, key);
  for (const theme of [light, dark]) {
    assert.ok(contrast(theme["--qr-text"], theme["--qr-white"]) >= 7);
    assert.ok(contrast(theme["--qr-slate-500"], theme["--qr-white"]) >= 4.5);
    assert.ok(contrast(theme["--qr-brand-600"], theme["--qr-white"]) >= 4.5);
  }
});

test("assets visuais e fonte local fazem parte do shell offline", () => {
  const sw = read("public/garcom-pwa/sw.js");
  for (const asset of [
    "design-tokens.css",
    "theme-init.js",
    "fonts/manrope-latin.woff2",
    "brand-mark.webp",
    "brand-wordmark.webp",
  ]) {
    assert.ok(sw.includes("'./" + asset + "'"), asset + " está no precache");
    assert.ok(fs.existsSync("public/garcom-pwa/" + asset), asset + " existe");
  }
  assert.match(tokens, /font-display: swap/);
  assert.doesNotMatch(read("index.html"), /fonts\.googleapis\.com/);
});
