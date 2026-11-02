"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const panorama = fs.readFileSync("src/screens/admin/PanoramaMesas.tsx", "utf8");
const mapa = fs.readFileSync("src/screens/admin/MapaQrMesas.tsx", "utf8");

test("cartão de mesa abre detalhes por clique e teclado quando recebe onAbrir", () => {
  assert.match(panorama, /role=\{onAbrir \? "button"/);
  assert.match(panorama, /tabIndex=\{onAbrir \? 0/);
  assert.match(panorama, /onClick=\{onAbrir \? \(\) => onAbrir\(mesa\.numero\)/);
  assert.match(panorama, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(panorama, /event\.preventDefault\(\);\s*onAbrir\(mesa\.numero\);/);
  assert.doesNotMatch(panorama, />\s*Abrir\s*</);
  assert.doesNotMatch(panorama, /<Btn/);
});

test("a pesquisa de mapa/QR usa os cartões e abre o detalhe da mesa", () => {
  // Mesma moldura do panorama, agora clicável: o cartão abre o modal de mesa.
  assert.match(mapa, /import \{ CartaoMesa \} from "\.\/PanoramaMesas"/);
  assert.match(mapa, /onAbrir=\{\(\) => onAbrirMesa\(mesa\.numero\)\}/);
  // As ações de QR/link/liberação não disparam o clique do cartão.
  assert.match(panorama, /stopPropagation/);
  assert.doesNotMatch(mapa, /role="button"/);
  assert.doesNotMatch(mapa, />\s*Abrir\s*</);
});

test("no panorama os cartões são apenas informativos", () => {
  // Sem onAbrir o cartão não ganha role/tabIndex/clique: só informação.
  assert.match(panorama, /<CartaoMesa key=\{mesa\.id\} mesa=\{mesa\} faixas=\{dados\.config\.faixas\} agora=\{agora\} \/>/);
  assert.doesNotMatch(panorama, /onAbrirMesa/);
  // A tela avisa onde operar a mesa, para o cartão não parecer quebrado.
  assert.match(panorama, /Mapa e QR Codes/);
});
