const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "guia-sistema.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

test("guia visual documenta as áreas do sistema e usa as capturas reais", () => {
  for (const area of ["Cozinha", "Bar", "Caixa", "Dashboard", "Cardápio", "Mesas", "Garçons", "Funções", "Cliente", "PWA"]) {
    assert.match(html, new RegExp(area, "i"));
  }

  const imagens = [...html.matchAll(/<img\b[^>]*src="\/assets\/apresentacao\/([^\"]+)"[^>]*>/g)];
  assert.deepEqual(
    imagens.map(([, nome]) => nome).sort(),
    [
      "cardapio-cliente.webp",
      "entregas-garcom.webp",
      "fechamento-caixa.webp",
      "fila-bar.webp",
      "fila-cozinha.webp",
      "dashboard-admin.webp",
    ].sort(),
  );
  for (const imagem of imagens) {
    const tag = imagem[0];
    assert.match(tag, /\balt="[^"]+"/);
    assert.match(tag, /\bwidth="\d+"/);
    assert.match(tag, /\bheight="\d+"/);
    assert.match(tag, /\bloading="lazy"/);
  }
  assert.doesNotMatch(html, /frame-placeholder|Placeholder:/i);
});

test("guia é demonstrativo, sem autenticação, operações ou chamadas à API", () => {
  assert.match(html, /Esta página é estática/);
  assert.match(html, /não autentica/i);
  assert.match(html, /não chama a API/i);
  assert.match(html, /não registra pagamento/i);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  assert.doesNotMatch(html, /(?:^|["'])\/api(?:\/|["'])/im);
  assert.doesNotMatch(html, /location\.(href|assign|replace)\s*=/);
});

test("README explica linguagens, tecnologias e aponta para o guia", () => {
  for (const term of ["TypeScript", "TSX", "JavaScript", "SQL", "HTML", "CSS", "JSON", "PostgreSQL", "React", "Node.js", "Vite", "guia-sistema.html"]) {
    assert.ok(readme.includes(term), "README deve documentar " + term);
  }
});
