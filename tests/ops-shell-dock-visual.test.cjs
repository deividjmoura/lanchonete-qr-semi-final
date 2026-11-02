"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const shell = fs.readFileSync("src/components/OpsShell.tsx", "utf8");
const css = fs.readFileSync("src/components/OpsShell.css", "utf8");

test("sidebar desktop permanece como dock de ícones e não expande no hover", () => {
  assert.match(shell, /import "\.\/OpsShell\.css"/);
  assert.match(shell, /data-label=\{n\.label\}/);
  assert.match(css, /\.ops-sidebar:hover,\s*\.ops-sidebar:focus-within\s*\{\s*width:\s*var\(--sidebar-collapsed,\s*72px\)/);
  assert.doesNotMatch(css, /\.ops-sidebar:hover\s*\{\s*width:\s*var\(--sidebar-expanded/);
});

test("nomes aparecem como tooltip sem fundo ou placa no hover/foco", () => {
  assert.match(css, /content:\s*attr\(data-label\)/);
  assert.match(css, /\.ops-nav-item:hover::after,[\s\S]*?\.ops-nav-item:focus-visible::after/);
  assert.match(css, /background:\s*transparent/);
  assert.match(css, /box-shadow:\s*none/);
  assert.match(css, /\.ops-nav-item:hover,[\s\S]*?background:\s*transparent\s*!important/);
});

test("divisórias internas decorativas são removidas sem apagar contornos dos cartões e controles", () => {
  for (const selector of [
    ".dash-ranking__item",
    ".dash-detail-list",
    ".dash-mini",
    ".dash-detail-row",
    ".ops-sessao__corpo",
    ".ops-card__topo",
    ".ops-card__rodape",
  ]) assert.ok(css.includes(selector), `falta override para ${selector}`);
  assert.match(css, /border-top:\s*0\s*!important/);
  assert.match(css, /border-bottom:\s*0\s*!important/);
  assert.doesNotMatch(css, /\.ops-card\s*\{[^}]*border:\s*0/);
  assert.doesNotMatch(css, /\.ops-item\s*\{[^}]*border:\s*0/);
});

test("redução de movimento continua respeitada", () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});


test("sidebar minimalista fica transparente e usa ícones maiores sem trilho ativo", () => {
  assert.match(shell, /<Icon size=\{24\}/);
  assert.doesNotMatch(shell, /ops-active-rail|layoutId="ops-active-rail"/);
  assert.match(css, /\.ops-sidebar\s*\{[^}]*background:\s*transparent\s*!important/s);
});

test("contornos decorativos da fila e do dashboard não reaparecem", () => {
  assert.match(css, /\.ops-stage,\s*\.dashboard-stage\s*\{\s*border:\s*0\s*!important/);
  assert.match(css, /\.ops-pill,\s*\.ops-sessao__contagem\s*\{\s*border:\s*0\s*!important/);
  assert.doesNotMatch(css, /\.ops-card\s*\{[^}]*border:\s*0/);
});
