"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const dashboard = fs.readFileSync("src/screens/Dashboard.tsx", "utf8");
const dashboardCss = fs.readFileSync("src/screens/dashboard.css", "utf8");
const admin = fs.readFileSync("src/screens/Admin.tsx", "utf8");
const shell = fs.readFileSync("src/components/OpsShell.tsx", "utf8");
const shellCss = fs.readFileSync("src/components/OpsShell.css", "utf8");
const dock = fs.readFileSync("src/hooks/useDockMagnify.ts", "utf8");

function carregarMotorLayout() {
  const filename = require.resolve("../src/lib/dashboard-layout.ts");
  const source = fs.readFileSync(filename, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(require("node:path").dirname(filename));
  mod._compile(js, filename);
  return mod.exports;
}

test("dashboard tem edição habilitada pelo lápis do header administrativo", () => {
  assert.match(admin, /toolbarAction=\{aba === "painel"/);
  assert.match(admin, /Editar dashboard/);
  assert.match(admin, /<Dashboard editMode=\{dashboardEditMode\} \/>/);
  assert.match(shell, /toolbarAction\?: ReactNode/);
});

test("todos os indicadores, gráfico e ranking compartilham o mesmo canvas", () => {
  assert.match(dashboard, /todos\.filter/);
  assert.match(dashboard, /<div className="dashboard-grid"/);
  assert.match(dashboard, /onDrop=\{editMode \? soltarWidget : undefined\}/);
  assert.match(dashboard, /<WidgetFrame id="grafico"/);
  assert.match(dashboard, /<WidgetFrame id="ranking"/);
  assert.doesNotMatch(dashboard, /dashboard-group--movement|dashboard-group--operation/);
  assert.doesNotMatch(dashboard, /idsMovimento|cardsMovimento|cardsOperacao/);
});

test("motor de layout impede sobreposição e procura a posição livre mais próxima", () => {
  const { canPlaceWidget, findAvailablePosition, rectsOverlap } = carregarMotorLayout();
  const widgets = { a: { x: 0, y: 0, w: 4, h: 2 }, b: { x: 4, y: 0, w: 4, h: 2 } };
  assert.equal(rectsOverlap(widgets.a, widgets.b), false);
  assert.equal(canPlaceWidget(widgets, "a", { x: 1, y: 0, w: 4, h: 2 }), false);
  assert.equal(canPlaceWidget(widgets, "a", { x: 0, y: 2, w: 4, h: 2 }), true);
  const placed = findAvailablePosition(widgets, "a", { x: 3, y: 0, w: 4, h: 2 });
  assert.equal(canPlaceWidget(widgets, "a", placed), true);
  assert.equal(placed.w, 4);
  assert.equal(placed.h, 2);
  assert.equal(placed.y >= 0, true);
});

test("cards e painéis podem ser movidos, redimensionados e ocultados", () => {
  assert.match(dashboard, /draggable=\{editando\}/);
  assert.match(dashboard, /onDragStart/);
  assert.match(dashboard, /onPointerDown=\{iniciarResize\}/);
  assert.match(dashboard, /onPointerMove=\{moverResize\}/);
  assert.match(dashboard, /card-neon__resize-handle/);
  assert.match(dashboard, /dashboard-widget__resize/);
  assert.match(dashboard, /alternarVisibilidade/);
  assert.match(dashboard, /visible: true/);
  assert.match(dashboard, /canPlaceWidget\(atual\.widgets, id, candidato\)/);
});

test("soltar sobre área ocupada respeita o destino e desloca quem estava lá", () => {
  const { canPlaceWidget, placeWidget, rectsOverlap } = carregarMotorLayout();
  const widgets = {
    a: { x: 0, y: 0, w: 3, h: 2 },
    b: { x: 3, y: 0, w: 3, h: 2 },
    c: { x: 6, y: 0, w: 3, h: 2 },
    d: { x: 9, y: 0, w: 3, h: 2 },
  };
  const depois = placeWidget(widgets, "a", { x: 3, y: 0, w: 3, h: 2 });
  // O card arrastado fica exatamente onde o ponteiro soltou — a causa raiz do
  // bug era justamente o card voltar para a origem quando o destino estava cheio.
  assert.deepEqual(depois.a, { x: 3, y: 0, w: 3, h: 2 });
  // Quem ocupava a área cede o lugar e, na ausência de opção melhor, assume a
  // vaga que o card arrastado deixou (troca de posição).
  assert.deepEqual(depois.b, { x: 0, y: 0, w: 3, h: 2 });
  for (const [id, rect] of Object.entries(depois)) {
    assert.equal(canPlaceWidget(depois, id, rect), true, `${id} não pode ficar sobreposto`);
  }
  assert.equal(rectsOverlap(depois.c, depois.d), false);
  // Nenhum widget pode sair da grade nem assumir coordenadas fracionárias.
  for (const rect of Object.values(depois)) {
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 12);
    assert.ok([rect.x, rect.y, rect.w, rect.h].every(Number.isInteger));
  }
});

test("busca de vaga ignora a origem para o card não voltar ao ponto de partida", () => {
  const { canPlaceWidget, findAvailablePosition } = carregarMotorLayout();
  const widgets = { b: { x: 4, y: 0, w: 4, h: 2 } };
  const origem = { x: 0, y: 0, w: 4, h: 2 };
  const livre = findAvailablePosition(widgets, "a", { x: 3, y: 0, w: 4, h: 2 }, 12, 300, origem);
  assert.notDeepEqual(livre, origem, "a vaga recém-liberada não pode ser o destino do arraste");
  assert.equal(canPlaceWidget(widgets, "a", livre), true);
  // Sem o parâmetro `avoid`, a vaga continua disponível (usado na leitura do layout).
  assert.deepEqual(findAvailablePosition(widgets, "a", origem), origem);
});

test("redimensionar cresce em largura e altura mesmo com vizinho na área nova", () => {
  const { canPlaceWidget, resizeWidget, rectsOverlap } = carregarMotorLayout();
  const widgets = { a: { x: 0, y: 0, w: 2, h: 2 }, b: { x: 2, y: 0, w: 2, h: 2 } };
  const depois = resizeWidget(widgets, "a", { w: 3, h: 3 });
  assert.deepEqual(depois.a, { x: 0, y: 0, w: 3, h: 3 }, "a alça precisa mudar largura e altura");
  assert.equal(rectsOverlap(depois.a, depois.b), false);
  assert.equal(canPlaceWidget(depois, "b", depois.b), true);
});

test("arraste usa a posição do ponteiro e não introduz controles direcionais", () => {
  assert.match(dashboard, /destinoDoPonteiro/);
  assert.match(dashboard, /arraste\.current/);
  assert.match(dashboard, /offsetX/);
  assert.match(dashboard, /offsetY/);
  assert.match(dashboard, /placeWidget\(atual\.widgets, id/);
  assert.match(dashboard, /data-dashboard-drop-preview/);
  // O requisito é arraste real com o mouse: nada de setas ou botões de passo.
  assert.doesNotMatch(dashboard, /card-neon__resize(?![-\w])/);
  assert.doesNotMatch(dashboard, /aria-label=\{`Mover/);
  assert.doesNotMatch(dashboard, /title="Mover/);
});

test("layout v1 migra e layout v2 persiste coordenadas, dimensões e visibilidade", () => {
  assert.match(dashboard, /STORAGE_LAYOUT = "qradmin-dashboard-layout-v2"/);
  assert.match(dashboard, /localStorage\.getItem\(STORAGE_LAYOUT\)/);
  assert.match(dashboard, /localStorage\.setItem\(STORAGE_LAYOUT/);
  assert.match(dashboard, /parsed\.widgets/);
  assert.match(dashboard, /Migra o layout v1/);
  assert.match(dashboard, /findAvailablePosition/);
  assert.match(dashboard, /Salvar layout/);
  assert.match(dashboard, /Restaurar padrão/);
});

test("canvas usa grade ampla no desktop e empilha widgets sem destruir o layout salvo no mobile", () => {
  assert.match(dashboardCss, /grid-template-columns:\s*repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(dashboardCss, /grid-auto-rows:\s*84px/);
  assert.match(dashboardCss, /@media \(max-width: 700px\)[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(dashboard, /gridColumn: `\$\{layout\.x \+ 1\} \/ span \$\{layout\.w\}`/);
  assert.match(dashboard, /gridRow: `\$\{layout\.y \+ 1\} \/ span \$\{layout\.h\}`/);
});

test("header e controles ficam transparentes e o dock horizontal usa magnificação", () => {
  assert.match(shell, /ops-toolbar-dock/);
  assert.match(shell, /toolbarDock\.onMouseMove/);
  assert.match(shell, /toolbarDock\.setItemRef/);
  assert.match(dock, /axis: "x" \| "y"/);
  assert.match(shellCss, /\.ops-topbar\s*\{[^}]*background:\s*transparent\s*!important/s);
  assert.match(shellCss, /\.ops-topbar \.ops-toolbar-dock button\s*\{[^}]*background:\s*transparent\s*!important/s);
});
