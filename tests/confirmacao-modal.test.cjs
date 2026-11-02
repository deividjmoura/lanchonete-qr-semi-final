"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const cp = require("node:child_process");

const root = process.cwd();
const ler = (path) => fs.readFileSync(path, "utf8");

test("ações destrutivas e operacionais usam confirmação modal, não confirm() nativo", () => {
  const paths = [
    "src/screens/Admin.tsx",
    "src/screens/Mesa.tsx",
    "src/screens/admin/MesaDetalheModal.tsx",
    "src/store/usePub.ts",
    "public/js/admin-cardapio.js",
    "public/js/admin-relatorio.js",
    "public/admin.html",
    "public/caixa.html",
    "public/garcom-pwa/app.js",
  ];
  for (const path of paths) {
    assert.doesNotMatch(ler(path), /\bconfirm\s*\(/, `${path} ainda usa confirmação nativa`);
  }
});

test("provider React apresenta alerta modal contextual com cancelar e confirmar", () => {
  const provider = ler("src/components/ConfirmacaoGlobal.tsx");
  const service = ler("src/lib/confirmacao.ts");
  const app = ler("src/App.tsx");
  const ui = ler("src/components/ui.tsx");
  assert.match(app, /<ConfirmacaoGlobal>/);
  assert.match(ui, /alert \? "alertdialog" : "dialog"/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(provider, /Confirmação necessária/);
  assert.match(provider, /Cancelar/);
  assert.match(service, /confirmarAcao/);
});

test("páginas estáticas e PWA carregam o mesmo modal de confirmação offline", () => {
  assert.match(ler("public/admin.html"), /src="\/garcom-pwa\/confirmacao\.js"/);
  assert.match(ler("public/caixa.html"), /src="\/garcom-pwa\/confirmacao\.js"/);
  assert.match(ler("public/garcom-pwa/index.html"), /src="\.\/confirmacao\.js"/);
  const sw = ler("public/garcom-pwa/sw.js");
  assert.match(sw, /garcom-pwa-shell-v36/);
  assert.match(sw, /'\.\/confirmacao\.js'/);
  assert.ok(sw.includes("if(!url.pathname.startsWith('/garcom-pwa/'))return;"));
  const helper = ler("public/garcom-pwa/confirmacao.js");
  assert.match(helper, /role','alertdialog'/);
  assert.match(helper, /aria-modal/);
  assert.match(helper, /solicitarTextoQR/);
  cp.execFileSync(process.execPath, ["--check", "public/garcom-pwa/confirmacao.js"]);
});
