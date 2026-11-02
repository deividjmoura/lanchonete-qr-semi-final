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

test("o panorama não lista as mesas", () => {
  // Listar as 70 mesas aqui criava um scroll enorme e não dava nenhuma
  // operação a mais: os cartões vivem só na pesquisa de mapa/QR.
  assert.doesNotMatch(panorama, /<CartaoMesa/);
  assert.doesNotMatch(panorama, /onAbrirMesa/);
  // A tela avisa onde ver e operar cada mesa.
  assert.match(panorama, /Mapa e QR Codes/);
  assert.match(panorama, /As mesas não são listadas/);
  // Cartão continua exportado (a pesquisa de mapa/QR é quem rende).
  assert.match(mapa, /<CartaoMesa/);
});
