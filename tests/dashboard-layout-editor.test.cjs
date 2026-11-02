"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const dashboard = fs.readFileSync("src/screens/Dashboard.tsx", "utf8");
const dashboardCss = fs.readFileSync("src/screens/dashboard.css", "utf8");
const admin = fs.readFileSync("src/screens/Admin.tsx", "utf8");
const shell = fs.readFileSync("src/components/OpsShell.tsx", "utf8");
const shellCss = fs.readFileSync("src/components/OpsShell.css", "utf8");
const dock = fs.readFileSync("src/hooks/useDockMagnify.ts", "utf8");

test("dashboard tem edição habilitada pelo lápis do header administrativo", () => {
  assert.match(admin, /toolbarAction=\{aba === "painel"/);
  assert.match(admin, /Editar dashboard/);
  assert.match(admin, /<Dashboard editMode=\{dashboardEditMode\} \/>/);
  assert.match(shell, /toolbarAction\?: ReactNode/);
});

test("cards podem ser reordenados e redimensionados em largura e altura", () => {
  assert.match(dashboard, /draggable=\{editando\}/);
  assert.match(dashboard, /onDragStart/);
  assert.match(dashboard, /event\.target as HTMLElement\)\.closest\("\.card-neon__resize-handle, \.card-neon__visibility"\)/, "controles internos não podem iniciar o drag nativo do card");
  assert.match(dashboard, /onDrop/);
  assert.match(dashboard, /onPointerDown=\{iniciarResize\}/);
  assert.match(dashboard, /onPointerMove=\{moverResize\}/);
  assert.match(dashboard, /card-neon__resize-handle/);
  assert.doesNotMatch(dashboard, /Diminuir largura|Aumentar largura/);
  assert.match(dashboard, /gridColumn:\s*\`span \$\{layout\.w\}\`/);
  assert.match(dashboard, /gridRow:\s*\`span \$\{layout\.h\}\`/);
  assert.match(dashboardCss, /grid-auto-rows:\s*minmax/);
});

test("ordem, dimensões, títulos e legendas são persistidos no navegador", () => {
  assert.match(dashboard, /STORAGE_LAYOUT = "qradmin-dashboard-layout-v1"/);
  assert.match(dashboard, /localStorage\.getItem\(STORAGE_LAYOUT\)/);
  assert.match(dashboard, /localStorage\.setItem\(STORAGE_LAYOUT/);
  assert.match(dashboard, /data-dashboard-heading/);
  assert.match(dashboard, /Tamanho da legenda/);
  assert.match(dashboard, /Tamanho do título/);
  assert.match(dashboard, /Restaurar padrão/);
  assert.match(dashboard, /Salvar layout/);
  assert.match(dashboard, /onToggleVisibility/);
  assert.match(dashboard, /visible:\s*true/);
  assert.match(dashboard, /dashboard-group--movement/);
  assert.match(dashboard, /dashboard-group--operation/);
});

test("header e controles ficam transparentes e o dock horizontal usa magnificação", () => {
  assert.match(shell, /ops-toolbar-dock/);
  assert.match(shell, /toolbarDock\.onMouseMove/);
  assert.match(shell, /toolbarDock\.setItemRef/);
  assert.match(dock, /axis: "x" \| "y"/);
  assert.match(shellCss, /\.ops-topbar\s*\{[^}]*background:\s*transparent\s*!important/s);
  assert.match(shellCss, /\.ops-topbar \.ops-toolbar-dock button\s*\{[^}]*background:\s*transparent\s*!important/s);
});
