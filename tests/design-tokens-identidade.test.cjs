"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const tokens = read("public/garcom-pwa/design-tokens.css");
const dashboard = read("src/screens/dashboard.css");
const operational = read("src/screens/operacional.css");

test("a identidade Estação tem uma única fonte de tokens para SPA e PWA", () => {
  assert.match(read("src/index.css"), /@import "\.\.\/public\/garcom-pwa\/design-tokens\.css"/);
  assert.match(read("public/garcom-pwa/styles.css"), /@import "\.\/design-tokens\.css"/);
  assert.match(read("public/garcom-pwa/index.html"), /design-tokens\.css/);
  assert.match(tokens, /--font-sans:\s*"DM Sans"/);
  assert.match(tokens, /--font-note:\s*"Kalam"/);
  assert.match(tokens, /--font-mono:\s*"JetBrains Mono"/);
  assert.match(tokens, /--brand:\s*#176d63/);
  assert.match(tokens, /--accent:\s*#c4d66a/);
  assert.match(tokens, /--radius-md:\s*14px/);
  assert.match(tokens, /--radius-lg:\s*18px/);
  assert.match(tokens, /--radius-xl:\s*24px/);
  assert.match(tokens, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(tokens, /#ffffff\b|#fff\b|#000000\b|#000\b/i);
  assert.doesNotMatch(tokens, /Comanda de Chapa|--prim-brasa|--prim-violeta|--stage-violet/i);
});

test("cozinha, bar e dashboard usam tokens, sem cores literais ou vidro", () => {
  const literal = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
  for (const [name, css] of [["dashboard", dashboard], ["operacional", operational]]) {
    assert.doesNotMatch(css, literal, name + " deve consumir tokens");
    assert.doesNotMatch(css, /radial-gradient|linear-gradient|backdrop-filter/i, name + " não usa glass ou gradiente decorativo");
    assert.doesNotMatch(css, /--neon|violet|violeta|brasa/i, name + " não carrega nomes ou cores da identidade anterior");
    assert.match(css, /var\(--stage-/);
  }
  assert.match(dashboard, /grid-column: span 2 !important/);
  assert.match(dashboard, /grid-column: span 4 !important/);
  assert.match(dashboard, /\.dash-mesas__stats \{ grid-template-columns: repeat\(2/);
});

test("superfícies SPA são sólidas e a marca permanece sem placa", () => {
  const spa = read("src/index.css");
  assert.match(spa, /\.stage-surface \{[\s\S]*background: var\(--stage-bg\)/);
  assert.match(spa, /\.stage-surface::before \{ display: none; \}/);
  assert.match(spa, /\.stage-card \{[\s\S]*background: var\(--stage-card\)/);
  const mark = spa.match(/\.brand-mark \{([\s\S]*?)\}/);
  assert.ok(mark);
  assert.doesNotMatch(mark[1], /background|border/);
});

test("PWA compartilha fontes Estação e atualiza o shell offline", () => {
  const sw = read("public/garcom-pwa/sw.js");
  assert.match(sw, /garcom-pwa-shell-v44/);
  for (const asset of [
    "../fonts/landing/dm-sans-latin-wght-normal.woff2",
    "../fonts/kalam-latin-400-normal.woff2",
    "../fonts/kalam-latin-700-normal.woff2",
    "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  ]) assert.ok(sw.includes(asset), asset + " precisa estar no precache");
  assert.match(read("public/garcom-pwa/theme-init.js"), /#142622/);
  assert.match(read("public/garcom-pwa/app.js"), /#142622/);
});

test("landing usa um único set Phosphor e narrativa progressiva com capturas reais", () => {
  assert.match(read("src/screens/landing/components/Icon.tsx"), /@phosphor-icons\/react/);
  const story = read("src/screens/landing/components/ScrollStory.tsx");
  assert.match(story, /IntersectionObserver/);
  assert.match(story, /scroll-story__path-progress/);
  const flow = read("src/screens/landing/sections/FlowSection.tsx");
  for (const asset of [
    "cardapio-cliente.webp", "personalizacao-produto.webp", "comanda-cliente.webp",
    "fila-cozinha.webp", "fila-bar.webp", "entregas-garcom.webp", "fechamento-caixa.webp",
  ]) assert.ok(flow.includes(asset), asset + " precisa estar na narrativa");
  const management = read("src/screens/landing/sections/ManagementSection.tsx");
  for (const asset of ["dashboard-admin.webp", "gestao-cardapio.webp", "mapa-mesas.webp"]) {
    assert.ok(management.includes(asset), asset + " precisa estar na narrativa de gestão");
  }
});

test("menu do cliente continua fora do rebranding", () => {
  const mesaHtml = read("public/mesa.html");
  assert.doesNotMatch(mesaHtml, /admin-identity\.css|public-identity\.css/);
  assert.match(read("src/screens/mesa-praia.css"), /body\[data-mesa-praia\]/);
  assert.match(read("src/main.tsx"), /window\.location\.hash\.startsWith\("\#\/mesa\/"\)/);
  assert.match(read("src/router.tsx"), /segs\[0\] === "mesa"/);
  const landing = read("src/screens/Landing.tsx");
  assert.match(landing, /ManagementSection/);
  for (const page of ["admin.html", "caixa.html", "cozinha.html", "bar.html", "garcom.html", "login.html"]) {
    assert.match(read("public/" + page), /admin-identity\.css/);
    assert.doesNotMatch(read("public/" + page), /theme-glass\.css/);
  }
  for (const page of ["apresentacao.html", "guia-sistema.html", "termos-de-uso.html", "termos-de-servico.html", "politica-de-privacidade.html"]) {
    assert.match(read("public/" + page), /public-identity\.css/);
  }
  for (const page of ["termos-de-uso.html", "termos-de-servico.html", "politica-de-privacidade.html"]) {
    assert.match(read("public/" + page), /contact-email-icon/);
  }
  assert.match(read("public/public-identity.css"), /\.contact-email-icon/);
});

test("contato oficial centralizado e e-mail apresentado como ícone", () => {
  const contact = read("src/screens/landing/contato.ts");
  assert.match(contact, /servicosdegestaoqradmin@gmail\.com/);
  assert.doesNotMatch(contact, /dejesusdemouradeivid|deividmoura729249/);
  assert.match(read("src/screens/Login.tsx"), /EMAIL_URL/);
  assert.match(read("src/screens/landing/sections/Footer.tsx"), /site-footer__contact-icon/);
  assert.match(read("src/screens/landing/components/FloatingActions.tsx"), /floating-actions__channel/);
  assert.match(read("public/politica-de-privacidade.html"), /servicosdegestaoqradmin@gmail\.com/);
});

test("a documentação declara a exceção do menu e a identidade Estação", () => {
  const docs = read("docs/DESIGN_SYSTEM.md");
  assert.match(docs, /Estação/);
  assert.match(docs, /#\/mesa\/:token/);
  assert.match(docs, /exceção/i);
  assert.match(read("REBRANDING.md"), /auditoria/i);
});
