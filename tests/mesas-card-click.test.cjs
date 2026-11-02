"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const panorama = fs.readFileSync("src/screens/admin/PanoramaMesas.tsx", "utf8");

test("card de mesa abre detalhes por clique e teclado, sem botão Abrir", () => {
  assert.match(panorama, /role="button"/);
  assert.match(panorama, /tabIndex=\{0\}/);
  assert.match(panorama, /onClick=\{onAbrir\}/);
  assert.match(panorama, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(panorama, /event\.preventDefault\(\);\s*onAbrir\(\);/);
  assert.doesNotMatch(panorama, />\s*Abrir\s*</);
  assert.doesNotMatch(panorama, /<Btn/);
});
