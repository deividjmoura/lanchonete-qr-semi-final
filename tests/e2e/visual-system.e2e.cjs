"use strict";
// Layout de produção com API simulada. Não altera banco, autenticação ou código da aplicação.
// npm run build && npm run preview -- --host 0.0.0.0 --port 4173
// node tests/e2e/visual-system.e2e.cjs
const { chromium } = require("playwright-core");
const binary = require("@sparticuz/chromium").default;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.VISUAL_BASE_URL || "http://localhost:4173";
const screenshots = process.env.VISUAL_SCREENSHOTS_DIR;
const menu = [
  {
    id: 1,
    nome: "Lanches",
    ordem: 0,
    produtos: [
      {
        id: 1,
        nome: "Burger da casa",
        preco: 29.9,
        descricao: "Pão brioche, blend da casa, queijo e molho especial.",
        fotoUrl: "/assets/demo/burger.webp",
        setor: "cozinha",
      },
      {
        id: 2,
        nome: "X-Bacon",
        preco: 32,
        descricao: "Bacon crocante, queijo derretido e muito sabor.",
        fotoUrl: "/assets/demo/xbacon.webp",
        setor: "cozinha",
      },
      {
        id: 3,
        nome: "Hot dog clássico",
        preco: 18,
        descricao: "O clássico que nunca sai de moda.",
        fotoUrl: "/assets/demo/dog-classic.webp",
        setor: "cozinha",
      },
    ],
  },
  {
    id: 2,
    nome: "Porções",
    ordem: 1,
    produtos: [
      {
        id: 4,
        nome: "Batata frita",
        preco: 24,
        descricao: "Crocante por fora. Macia por dentro.",
        fotoUrl: "/assets/demo/fries.webp",
        setor: "cozinha",
      },
    ],
  },
  {
    id: 3,
    nome: "Bebidas",
    ordem: 2,
    produtos: [
      {
        id: 5,
        nome: "Suco natural",
        preco: 12,
        descricao: "Feito na hora, com fruta de verdade.",
        fotoUrl: "/assets/demo/juice.webp",
        setor: "bar",
      },
    ],
  },
];
const tables = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  numero: i + 1,
  token: "visual-" + (i + 1),
  status: i < 4 ? "ocupada" : "livre",
  sessaoId: i < 4 ? i + 1 : null,
  garcomResponsavelId: i < 2 ? 1 : null,
  garcomResponsavelNome: i < 2 ? "Ana" : null,
  clienteNome: i < 2 ? "Marina" : null,
}));
const orders = ["recebido", "em_producao", "concluido"].map((status, i) => ({
  id: 100 + i,
  sessao_id: 1,
  mesa_id: i + 1,
  mesa: i + 1,
  cliente_nome: ["Marina", "Rafael", "Júlia"][i],
  status,
  criado_em: new Date(Date.now() - i * 180000).toISOString(),
  itens: [
    {
      id: 200 + i,
      produto_id: 1,
      nome: "Burger da casa",
      quantidade: 2,
      preco_unitario: 29.9,
      status,
      setor: "cozinha",
      adicionais: [],
    },
  ],
}));
async function mock(route) {
  const u = new URL(route.request().url()),
    p = u.pathname;
  let data = [];
  if (p === "/api/cardapio" || p === "/api/admin/cardapio") data = menu;
  else if (p === "/api/me")
    data = {
      staff: { id: 1, papel: "admin", nome: "Admin", deveTrocarSenha: false },
    };
  else if (p === "/api/admin/mesas" || p === "/api/mesas") data = tables;
  else if (p === "/api/admin/dashboard")
    data = {
      faturamento: 1284.5,
      pedidosTotal: 42,
      ticketMedio: 53.52,
      contasFechadas: 24,
      emAberto: { valorEntregue: 428.8 },
      porDia: ["Sáb", "Dom", "Seg", "Ter", "Qua", "Qui", "Hoje"].map(
        (label, i) => ({
          dia: label,
          label,
          faturamento: [800, 1200, 0, 680, 900, 1500, 1284][i],
          contas: 5,
        }),
      ),
      topProdutos: [
        { nome: "Burger da casa", quantidade: 32 },
        { nome: "X-Bacon", quantidade: 24 },
        { nome: "Batata frita", quantidade: 18 },
      ],
    };
  else if (p.includes("/api/mesas/") && p.endsWith("/sessao"))
    data = {
      mesa: 1,
      mesaId: 1,
      mesaNome: "Mesa 01",
      sessaoAberta: true,
      sessaoId: 1,
      pedidos: [],
      totalDevido: 0,
      valorPago: 0,
      valorRestante: 0,
    };
  else if (p === "/api/cozinha/pedidos") data = orders;
  else if (p === "/api/bar/pedidos")
    data = orders.map((o) => ({
      ...o,
      itens: o.itens.map((it) => ({
        ...it,
        nome: "Suco natural",
        setor: "bar",
      })),
    }));
  else if (p === "/api/caixa/sessoes")
    data = [
      {
        id: 1,
        mesa: 1,
        valorTotal: 59.8,
        valorRestante: 59.8,
        clienteNome: "Marina",
        pedidos: orders,
      },
    ];
  else if (p.endsWith("/garcons-ativos"))
    data = { garcons: [{ id: 1, nome: "Ana", ativo: true }] };
  else if (p.includes("/api/garcom/") && p.endsWith("/mesas"))
    data = { garcom: { id: 1, nome: "Ana" }, mesas: tables };
  else if (p === "/api/config/pix")
    data = { chave: "", nome: "QR Admin", cidade: "Itajaí" };
  else if (p.includes("event"))
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: ": test\n\n",
    });
  return route.fulfill({ json: data });
}

async function inViewport(page, locator) {
  const box = await locator.boundingBox();
  assert.ok(box, "Elemento deve estar visível");
  const viewport = page.viewportSize();
  assert.ok(
    box.x >= -1 && box.x + box.width <= viewport.width + 1,
    `Elemento cabe horizontalmente: ${await locator.getAttribute("class")} em ${viewport.width}, x=${box.x}, w=${box.width}`,
  );
  return box;
}
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_EXECUTABLE_PATH || (await binary.executablePath()),
    args: binary.args.filter((a) => a !== "--single-process"),
    headless: true,
  });
  let layouts = 0;
  try {
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: scheme,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      await context.addInitScript(() => {
        if (!location.hash.startsWith("#/login"))
          sessionStorage.setItem(
            "pub-auth",
            JSON.stringify({ role: "admin", nome: "Admin" }),
          );
        localStorage.setItem("garcom-notification-intro-v1-visual", "1");
      });
      await context.route("**/api/**", mock);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const styles = {};
      for (const screen of [
        "admin",
        "mesa",
        "cozinha",
        "bar",
        "caixa",
        "pwa",
        "login",
        "home",
      ]) {
        if (screen === "login") {
          await page.evaluate(() => sessionStorage.removeItem("pub-auth"));
          await page.route("**/api/me", (route) => route.fulfill({ json: {} }));
        }
        await page.goto(
          base +
            (screen === "pwa"
              ? "/garcom-pwa/?token=visual"
              : "/#/" +
                (screen === "home" ? "" : screen) +
                (screen === "mesa" ? "/visual-1" : "")),
          { waitUntil: "load" },
        );
        await page
          .locator(
            screen === "pwa"
              ? "#tableGrid .table-tile"
              : screen === "mesa"
                ? ".mesa-hero"
                : screen === "login"
                  ? ".brand-logo"
                  : "h1",
          )
          .first()
          .waitFor();
        await page.evaluate(() => document.fonts.ready);
        for (const width of [320, 375, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(150);
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          await page.evaluate(() => window.scrollTo(0, 0));
          const measured = await page.evaluate(() => {
            const root = getComputedStyle(document.documentElement);
            return {
              width: innerWidth,
              scroll: document.documentElement.scrollWidth,
              font: getComputedStyle(document.body).fontFamily,
              page: root.getPropertyValue("--qr-page").trim(),
              card: root.getPropertyValue("--qr-white").trim(),
            };
          });
          assert.ok(
            measured.scroll <= width,
            `${screen}/${scheme}/${width}: sem overflow horizontal`,
          );
          assert.ok(
            measured.font.includes("Manrope"),
            `${screen}: fonte compartilhada`,
          );
          if (["mesa", "pwa"].includes(screen)) styles[screen] = measured;
          if (["admin", "cozinha", "bar", "caixa"].includes(screen)) {
            if (width >= 1024) {
              const sidebar = await inViewport(
                page,
                page.locator(".ops-sidebar"),
              );
              assert.equal(sidebar.x, 0);
              assert.equal(sidebar.width, 224);
              assert.equal(sidebar.height, 900);
              const mainBox = await page.locator(".ops-main").boundingBox();
              assert.ok(
                mainBox.x >= 223,
                `${screen}/${scheme}: main x=${mainBox.x}`,
              );
            }
            await inViewport(page, page.locator(".ops-brand"));
            await inViewport(
              page,
              page.getByRole("button", { name: /Ativar tema/ }),
            );
          }
          if (screen === "admin") {
            assert.equal(await page.locator(".metric-value").count(), 4);
            assert.ok(
              await page
                .locator(".metric-value")
                .evaluateAll((values) =>
                  values.every((el) => el.scrollWidth <= el.clientWidth),
                ),
              "Métricas não cortam valores",
            );
            const tracks = page.locator(".h-44 > div > div");
            assert.equal(await tracks.count(), 7);
            assert.ok((await tracks.first().boundingBox()).height > 100);
          }
          if (screen === "pwa") {
            const mark = await inViewport(page, page.locator(".brand-symbol"));
            const pill = await inViewport(page, page.locator("#connection"));
            assert.ok(
              mark.x + mark.width <= pill.x,
              "Marca não sobrepõe conexão",
            );
            await inViewport(page, page.locator(".bottom-nav"));
          }
          if (screenshots && [375, 1440].includes(width)) {
            fs.mkdirSync(screenshots, { recursive: true });
            await page.screenshot({
              path: path.join(screenshots, `${screen}-${scheme}-${width}.png`),
              fullPage: true,
            });
          }
          layouts++;
        }
        if (screen === "mesa") {
          await page
            .getByRole("button", { name: "Ver Burger da casa", exact: true })
            .click();
          await inViewport(page, page.getByRole("dialog"));
          await page
            .getByRole("button", { name: "Fechar", exact: true })
            .click();
        }
        if (screen === "pwa") {
          for (const tab of ["orders", "deliveries", "billing", "tables"]) {
            await page.locator(`[data-tab="${tab}"]`).click();
            assert.equal(
              await page.locator(".page.active").getAttribute("data-page"),
              tab,
            );
          }
          await page.setViewportSize({ width: 375, height: 900 });
          await page.locator("#newOrderTables").click();
          const box = await inViewport(page, page.locator("#orderModal"));
          assert.ok(
            box.y > 0 && box.y + box.height < 900,
            "Diálogo centralizado com margens",
          );
          await page.locator("#closeOrder").click();
        }
      }
      assert.equal(styles.mesa.page, styles.pwa.page, "Mesa/PWA: mesmo fundo");
      assert.equal(
        styles.mesa.card,
        styles.pwa.card,
        "Mesa/PWA: mesma superfície",
      );
      assert.deepEqual(errors, [], "Sem erros de execução");
      // A escolha feita no sistema deve prevalecer sobre a preferência oposta do SO na PWA.
      await page.evaluate(() => localStorage.setItem("qradmin-tema", "claro"));
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(base + "/garcom-pwa/?token=visual");
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        "claro",
      );
      await page.evaluate(() => localStorage.setItem("qradmin-tema", "escuro"));
      await page.emulateMedia({ colorScheme: "light" });
      await page.reload();
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        "escuro",
      );
      await context.close();
    }
    // Shell real: instalação do service worker e recarga sem rede, incluindo tokens e fonte.
    const offline = await browser.newContext({ colorScheme: "dark" });
    const page = await offline.newPage();
    await page.goto(base + "/garcom-pwa/");
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) throw Error("Service worker não ativou");
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await offline.setOffline(true);
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "escuro",
    );
    assert.ok(
      await page.evaluate(() => document.fonts.check('600 16px "Manrope"')),
    );
    assert.equal(
      await page
        .locator(".brand-mark")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
      true,
    );
    await offline.close();
    console.log(
      `✓ ${layouts} layouts, temas, navegação, diálogos e shell offline validados.`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
