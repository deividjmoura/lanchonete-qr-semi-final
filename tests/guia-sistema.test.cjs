const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "guia-sistema.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
test("guia visual documenta as áreas do sistema", () => {
  for (const area of ["Cozinha", "Bar", "Caixa", "Dashboard", "Cardápio", "Mesas", "Garçons", "Funções", "Cliente", "PWA"]) assert.match(html, new RegExp(area, "i"));
  assert.match(html, /data-help=/); assert.match(html, /helpBubble/);
});
test("guia é demonstrativo e não chama APIs nem navega para telas reais", () => {
  assert.match(html, /Modo demonstração/); assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(html, /location\.(href|assign|replace)\s*=/); assert.match(html, /event\.preventDefault\(\)/);
});
test("README explica linguagens, tecnologias e aponta para o guia", () => {
  for (const term of ["TypeScript", "TSX", "JavaScript", "SQL", "HTML", "CSS", "JSON", "PostgreSQL", "React", "Node.js", "Vite", "guia-sistema.html"]) assert.ok(readme.includes(term), "README deve documentar " + term);
});