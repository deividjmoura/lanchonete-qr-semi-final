"use strict";

/**
 * Identidade visual global — "Palco Azul/Violeta" (dashboard "Os números da sua casa").
 *
 * Contrato desta suíte:
 *  1. existe uma única fonte de tokens e o palco é definido nela;
 *  2. nenhum dos arquivos de camada visual escreve cor literal (hex/rgba);
 *  3. os componentes têm classes de palco para reuso (sem reinventar superfície);
 *  4. o PWA importa a mesma fonte e não mantém paleta paralela;
 *  5. a exceção (cardápio do cliente) é explícita e continua isolada.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

const tokens = read("public/garcom-pwa/design-tokens.css");
const dashboard = read("src/screens/dashboard.css");
const operacional = read("src/screens/operacional.css");
const spaCss = read("src/index.css");

const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

test("camada de identidade não contém cor literal: tudo vem de token", () => {
  for (const [arquivo, conteudo] of [
    ["src/screens/dashboard.css", dashboard],
    ["src/screens/operacional.css", operacional],
  ]) {
    assert.doesNotMatch(conteudo, LITERAL, `${arquivo} deve consumir apenas var(--stage-*)`);
    assert.match(conteudo, /var\(--stage-/, `${arquivo} precisa usar os tokens do palco`);
  }
});

test("tokens do palco existem, são estáveis e cobrem superfície, tinta, acento e estado", () => {
  const exigidos = [
    "--stage-bg", "--stage-bg-2", "--stage-panel", "--stage-card", "--stage-inset",
    "--stage-ink", "--stage-ink-muted", "--stage-ink-subtle", "--stage-ink-faint",
    "--stage-line", "--stage-hairline-2",
    "--stage-violet", "--stage-violet-soft", "--stage-cyan", "--stage-lime", "--stage-rose", "--stage-amber",
    "--stage-ok-ink", "--stage-warn-ink", "--stage-danger-ink", "--stage-info-ink",
    "--stage-focus", "--stage-grid",
  ];
  for (const nome of exigidos) {
    assert.match(tokens, new RegExp(`${nome}:`), `token ${nome} precisa existir`);
  }
  // O palco é escuro por definição: fundo escuro e tinta clara.
  assert.match(tokens, /--stage-bg: #[0-1][0-9a-f]{5};/);
  assert.match(tokens, /--stage-ink: #e[0-9a-f]{5}|--stage-ink: #f[0-9a-f]{5}/);
});

test("tokens semânticos globais seguem a identidade azul/violeta nos dois temas", () => {
  const claro = tokens.slice(tokens.indexOf('[data-theme="claro"]'), tokens.indexOf("@media (prefers-color-scheme: dark)"));
  const escuro = tokens.slice(tokens.indexOf(':root[data-theme="escuro"]'));
  // Violeta como ação primária e superfícies azuladas (nada de papel/madeira).
  assert.match(tokens, /--prim-violeta: #7c5cff;/);
  assert.match(tokens, /--prim-meia-noite: #0b101b;/);
  assert.match(tokens, /--prim-nevoa: #e4e8f1;/);
  assert.match(claro, /--brand: var\(--prim-violeta-escuro\)/);
  assert.match(escuro, /--brand: var\(--prim-violeta-claro\)/);
  assert.match(escuro, /--surface: var\(--prim-meia-noite\)/);
  // A paleta anterior não pode voltar a alimentar os tokens semânticos.
  for (const bloco of [claro, escuro]) {
    assert.doesNotMatch(bloco, /--prim-brasa|--prim-papel|--prim-lousa/, "tokens semânticos sem paleta antiga");
  }
});

test("camada de identidade expõe espaçamento, movimento, elevação e vidro", () => {
  for (const grupo of [
    ["--space-1", "--space-9"],
    ["--dur-quick", "--dur-base", "--dur-slow"],
    ["--ease-out", "--ease-in-out"],
    ["--elev-1", "--elev-4"],
    ["--glass-sheen", "--glass-border", "--glass-blur"],
  ]) {
    for (const nome of grupo) assert.match(tokens, new RegExp(`${nome}:`), `token ${nome}`);
  }
  assert.match(tokens, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,200}--dur-base: 0ms/);
});

test("SPA oferece superfície e cartão de palco reutilizáveis, sem recriar sombra local", () => {
  assert.match(spaCss, /\.stage-surface \{[\s\S]*var\(--stage-bg-2\)/);
  assert.match(spaCss, /\.stage-surface::before \{[\s\S]*var\(--stage-grid\)/);
  assert.match(spaCss, /\.stage-card \{[\s\S]*var\(--glass-sheen\)/);
  assert.match(spaCss, /\.stage-card:hover[\s\S]{0,200}var\(--elev-4\)/);
  // A superfície de vidro do sistema usa os hairlines do palco.
  assert.match(spaCss, /\[data-glass-card\] \{[\s\S]{0,220}var\(--glass-sheen\)/);
  assert.match(spaCss, /inset 0 1px 0 var\(--glass-border\)/);
});

test("a marca entra sem fundo (igual ao PWA) e clareia sobre superfície escura", () => {
  // O PNG já tem canal alpha: placa branca/borda aqui era o que destoava do
  // Atendimento. A marca assenta direto na superfície.
  const bloco = spaCss.match(/\.brand-mark \{([\s\S]*?)\}/);
  assert.ok(bloco, "regra .brand-mark precisa existir");
  assert.doesNotMatch(bloco[1], /background/, ".brand-mark não pode ter placa de fundo");
  assert.doesNotMatch(bloco[1], /border/, ".brand-mark não pode ter borda");
  // A tinta do arquivo é escura: sem placa ela sumiria na barra lateral (fundo
  // escuro nos dois temas) e no tema escuro — o filtro só troca a tinta.
  assert.match(spaCss, /\.ops-sidebar \.brand-mark img[\s\S]{0,120}\[data-theme="escuro"\] \.brand-mark img \{\s*filter: brightness\(0\) invert\(1\);/);
  // Segue sendo a mesma arte, servida como PNG transparente.
  assert.match(read("src/components/ui.tsx"), /src="\/logo\/qradmin-mark\.png"/);
});

test("PWA consome a mesma fonte de tokens e mantém a imagem no shell offline", () => {
  assert.match(read("public/garcom-pwa/styles.css"), /@import "\.\/design-tokens\.css"/);
  assert.match(read("public/garcom-pwa/index.html"), /design-tokens\.css/);
  const sw = read("public/garcom-pwa/sw.js");
  assert.match(sw, /design-tokens\.css/, "o shell precisa versionar os tokens para o aparelho atualizar");
});

test("exceção declarada: o cardápio do cliente segue isolado e documentado", () => {
  const docs = read("docs/DESIGN_SYSTEM.md");
  assert.match(docs, /#\/mesa\/:token/);
  assert.match(docs, /exceção/i);
  assert.match(docs, /Palco Azul\/Violeta/);
});
