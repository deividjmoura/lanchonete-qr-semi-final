"use strict";

/**
 * Casco das telas internas (cozinha, bar, caixa, administração).
 *
 * Substitui o antigo `ops-shell-dock-visual.test.cjs`, que fixava a aparência da
 * identidade anterior (dock transparente com ampliação de ícones e nomes em
 * tooltip). Na identidade "Passe" a navegação é uma linha de passe: um trilho
 * sólido, em tinta, onde cada tela é uma estação com ícone E nome sempre
 * visíveis. O que continua valendo, e é conferido aqui, é o comportamento:
 * largura fixa no computador, gaveta abaixo de 1024px, estado atual anunciado,
 * alvos de toque e respeito a movimento reduzido.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), "utf8");
const shell = ler("src/components/OpsShell.tsx");
const css = ler("src/components/OpsShell.css");
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");

const blocoDesktop = () => {
  const inicio = semComentarios.indexOf("@media (min-width: 1024px)");
  assert.ok(inicio >= 0, "o casco precisa de um bloco para telas a partir de 1024px");
  const fim = semComentarios.indexOf("@media", inicio + 10);
  return semComentarios.slice(inicio, fim < 0 ? undefined : fim);
};

test("no computador o trilho tem largura fixa e não muda de tamanho com o ponteiro", () => {
  assert.match(shell, /import "\.\/OpsShell\.css"/);
  assert.match(blocoDesktop(), /\.ops-sidebar \{[^}]*width: var\(--sidebar-collapsed\)/);
  assert.match(blocoDesktop(), /\.ops-main \{[^}]*margin-left: var\(--sidebar-collapsed\)/);
  assert.doesNotMatch(semComentarios, /\.ops-sidebar:(hover|focus-within)/, "o trilho não expande nem encolhe no hover/foco");
  assert.doesNotMatch(semComentarios, /transform:\s*scale\(/, "sem ampliação de ícones");
  assert.ok(!fs.existsSync(path.join(raiz, "src/hooks/useDockMagnify.ts")), "o efeito de dock saiu junto com a identidade antiga");
  assert.doesNotMatch(shell, /useDockMagnify|ops-active-rail/);
});

test("cada estação mostra ícone e nome: o nome não depende de hover nem de tooltip", () => {
  assert.match(shell, /<span className="ops-sidebar-label">\{n\.label\}<\/span>/);
  assert.match(shell, /aria-label=\{n\.label\}/);
  assert.match(shell, /data-label=\{n\.label\}/);
  assert.doesNotMatch(semComentarios, /content:\s*attr\(data-label\)/, "o nome é texto de verdade, não conteúdo gerado");
  assert.doesNotMatch(blocoDesktop(), /\.ops-sidebar-label[^{]*\{[^}]*display:\s*none/, "o nome continua visível no trilho estreito");
  /* só o nome da marca é recolhido no trilho de 72px; o símbolo fica */
  assert.match(blocoDesktop(), /\.ops-brand-name \{\s*display: none;/);
});

test("a estação atual é anunciada e marcada em sinal, sem depender só de cor de fundo", () => {
  assert.match(shell, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(shell, /data-active=\{active \? "true" : "false"\}/);
  assert.match(shell, /weight=\{active \? "fill" : "regular"\}/, "o ícone preenchido reforça a estação atual");
  assert.match(semComentarios, /\.ops-nav-item\[data-active="true"\]::before \{[^}]*background: var\(--ink-band-signal\)/);
});

test("a linha de passe é sólida, em tinta, e os alvos de toque têm pelo menos 44px", () => {
  assert.match(semComentarios, /\.ops-sidebar \{[^}]*background: var\(--surface-sidebar\)/);
  assert.match(semComentarios, /\.ops-sidebar \{[^}]*border-right: 1px solid var\(--sidebar-line\)/);
  assert.doesNotMatch(semComentarios, /backdrop-filter/, "sem vidro");
  assert.doesNotMatch(semComentarios, /!important/, "o casco não precisa vencer ninguém à força");
  assert.match(semComentarios, /\.ops-nav-item \{[^}]*min-height: 48px/);
  assert.match(semComentarios, /\.ops-sidebar-close,\s*\.ops-menu-trigger \{[^}]*width: 44px;[^}]*height: 44px/);
  assert.doesNotMatch(semComentarios, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, "cores só por token");
});

test("abaixo de 1024px a navegação é uma gaveta com fundo, foco preso e Esc", () => {
  assert.match(shell, /className="ops-sidebar-backdrop" aria-label="Fechar menu"/);
  assert.match(shell, /data-open=\{menuAberto \? "true" : "false"\}/);
  assert.match(shell, /role=\{menuAberto \? "dialog" : undefined\}/);
  assert.match(shell, /aria-controls="ops-navigation"/);
  assert.match(shell, /aria-expanded=\{menuAberto\}/);
  assert.match(shell, /window\.matchMedia\("\(min-width: 1024px\)"\)/);
  assert.match(shell, /event\.key === "Escape"/, "Esc fecha a gaveta");
  assert.match(shell, /event\.key === "Tab"/, "Tab circula dentro da gaveta aberta");
  assert.match(shell, /menuTriggerRef\.current\?\.focus\(\)/, "ao fechar, o foco volta para o botão de menu");
  assert.match(semComentarios, /\.ops-sidebar \{[^}]*visibility: hidden/, "fechada, a gaveta sai da ordem de tabulação");
  assert.match(semComentarios, /\.ops-sidebar\[data-open="true"\] \{[^}]*visibility: visible/);
  assert.match(blocoDesktop(), /\.ops-sidebar-backdrop,\s*\.ops-sidebar-close,\s*\.ops-menu-trigger \{\s*display: none;/);
});

test("redução de movimento continua respeitada", () => {
  assert.match(semComentarios, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.ops-sidebar,[\s\S]*?transition: none;/);
});
