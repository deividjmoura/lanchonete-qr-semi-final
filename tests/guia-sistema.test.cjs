const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "guia-sistema.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
test("guia visual documenta as áreas do sistema", () => {
  for (const area of ["Cozinha", "Bar", "Caixa", "Dashboard", "Cardápio", "Mesas", "Garçons", "Funções", "Cliente", "PWA"]) assert.match(html, new RegExp(area, "i"));
  for (const id of ["fluxo", "cliente", "cozinha", "bar", "garcom", "caixa", "admin", "regras"]) {
    assert.ok(html.includes(`id="${id}"`), `seção ${id} presente`);
    assert.ok(html.includes(`href="#${id}"`), `navegação para ${id} presente`);
  }
  assert.match(html, /aria-expanded/);
});
test("guia é estático, sem APIs ou redirecionamentos automáticos", () => {
  assert.match(html, /Demonstração visual/); assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(html, /location\.(href|assign|replace)\s*=/); assert.doesNotMatch(html, /<form\b/i);
});
test("README explica linguagens, tecnologias e aponta para o guia", () => {
  for (const term of ["TypeScript", "TSX", "JavaScript", "SQL", "HTML", "CSS", "JSON", "PostgreSQL", "React", "Node.js", "Vite", "guia-sistema.html"]) assert.ok(readme.includes(term), "README deve documentar " + term);
});