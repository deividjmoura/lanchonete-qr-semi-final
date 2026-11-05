"use strict";
// Validação visual e estrutural do sistema "Palco Azul/Violeta" em Chromium real.
// Executado pelo runner scripts/run-e2e-tests.js, que fornece uma porta isolada via VISUAL_BASE_URL.
const { chromium } = require("playwright-core");
const binary = require("@sparticuz/chromium").default;
const { criarDashboard, aguardarLayoutDashboard } = require("./fixtures/dashboard.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const base = process.env.VISUAL_BASE_URL;
if (!base) {
  throw new Error('VISUAL_BASE_URL ausente. Execute npm run test:e2e para usar o preview isolado do runner.');
}
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
        descricao: "Bacon crocante, queijo derretido e cebola caramelizada.",
        fotoUrl: "/assets/demo/xbacon.webp",
        setor: "cozinha",
      },
      {
        id: 3,
        nome: "Hot dog clássico",
        preco: 18,
        descricao: "Pão macio, salsicha artesanal e batata palha.",
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
        descricao: "Crocante por fora, macia por dentro.",
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
        descricao: "Feito na hora.",
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
  pedidoClienteQr: i === 2,
}));

const orders = ["recebido", "em_producao", "concluido"].map((status, i) => ({
  id: 100 + i,
  sessao_id: 1,
  mesa_id: i + 1,
  mesa: i + 1,
  cliente_nome: ["Marina", "Rafael", "Júlia"][i],
  responsavelMesaNome: "Ana",
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

const pwaReadyOrders = [
  {
    id: 301,
    mesa: 2,
    responsavelMesaNome: "Ana",
    criado_em: new Date(Date.now() - 240000).toISOString(),
    itens: [
      { id: 401, nome: "Burger da casa", quantidade: 2, setor: "cozinha", status: "concluido", adicionais: [] },
    ],
  },
  {
    id: 302,
    mesa: 5,
    responsavelMesaNome: "Carlos",
    criado_em: new Date(Date.now() - 120000).toISOString(),
    itens: [
      { id: 402, nome: "Suco natural", quantidade: 1, setor: "bar", status: "concluido", adicionais: [] },
    ],
  },
];

async function mock(route) {
  const u = new URL(route.request().url());
  const p = u.pathname;
  let data = [];
  if (p === "/api/cardapio" || p === "/api/admin/cardapio") data = menu;
  else if (p === "/api/me")
    data = {
      staff: { id: 1, papel: "admin", nome: "Admin", deveTrocarSenha: false },
    };
  else if (p === "/api/admin/mesas" || p === "/api/mesas") data = tables;
  else if (p === "/api/admin/dashboard")
    data = criarDashboard({
      periodo: u.searchParams.get("periodo") || "hoje", faturamento: 1284.5,
      pedidosTotal: 42, ticketMedio: 53.52, contasFechadas: 24,
      topProdutos: [
        { nome: "Burger da casa", quantidade: 32 },
        { nome: "X-Bacon", quantidade: 24 },
        { nome: "Batata frita", quantidade: 18 },
      ],
    });
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
      itens: o.itens.map((it) => ({ ...it, nome: "Suco natural", setor: "bar" })),
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
  else if (p.endsWith("/garcons-ativos")) data = { garcons: [{ id: 1, nome: "Ana", ativo: true }] };
  else if (p.includes("/api/garcom/") && p.endsWith("/mesas"))
    data = { garcom: { id: 1, nome: "Ana" }, mesas: tables };
  else if (p.includes("/api/garcom/") && p.endsWith("/me"))
    data = { id: 1, nome: "Ana" };
  else if (p.includes("/api/garcom/") && p.endsWith("/pedidos")) data = pwaReadyOrders;
  else if (p.includes("/api/garcom/") && p.endsWith("/atendimentos")) data = [];
  else if (p === "/api/config/pix") data = { chave: "", nome: "QR Admin", cidade: "Itajaí" };
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
    `Elemento cabe horizontalmente em ${viewport.width}, x=${box.x}, w=${box.width}`,
  );
  return box;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || (await binary.executablePath()),
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
          sessionStorage.setItem("pub-auth", JSON.stringify({ role: "admin", nome: "Admin" }));
        localStorage.setItem("garcom-notification-intro-v1-visual", "1");
        /* O PWA reconecta o SSE em ~1s quando o stream do mock fecha, e cada
           reconexão dispara refreshLiveData() -> loadDeliveries(), que troca os
           cards por replaceChildren(). Isso derrubava o clique do acordeão de
           forma intermitente (o teste lia o aria-expanded de um nó já removido).
           Aqui o realtime é neutralizado: este teste valida layout/tema, não
           atualização em tempo real — e o acordeão é exercitado sem corrida. */
        window.EventSource = class {
          constructor() {
            this.onerror = null;
          }
          addEventListener() {}
          close() {}
        };
      });
      await context.route("**/api/**", mock);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const styles = {};

      for (const screen of ["admin", "mesa", "cozinha", "bar", "caixa", "pwa", "login", "home"]) {
        if (screen === "login") {
          await page.evaluate(() => sessionStorage.removeItem("pub-auth"));
          await page.route("**/api/me", (route) => route.fulfill({ json: {} }));
        }
        await page.goto(
          base +
            (screen === "pwa"
              ? "/garcom-pwa/?token=visual"
              : "/#/" + (screen === "home" ? "" : screen) + (screen === "mesa" ? "/visual-1" : "")),
          { waitUntil: "load" },
        );
        if (screen === "pwa") {
          // O salão completo só aparece depois da busca por número.
          await page.locator("#tableSearch").fill("1");
        }
        await page
          .locator(
            screen === "pwa"
              ? "#tableGrid .table-tile"
              : screen === "login"
                ? ".brand-logo"
                : "h1",
          )
          .first()
          .waitFor();
        await page.evaluate(() => document.fonts.ready);

        for (const width of [320, 375, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(120);
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          await page.evaluate(() => window.scrollTo(0, 0));

          const measured = await page.evaluate(() => {
            const root = getComputedStyle(document.documentElement);
            const bodyBg = getComputedStyle(document.body).backgroundColor;
            return {
              width: innerWidth,
              scroll: document.documentElement.scrollWidth,
              font: getComputedStyle(document.body).fontFamily,
              bodyBg,
              surface: root.getPropertyValue("--surface").trim(),
              raised: root.getPropertyValue("--surface-raised").trim(),
            };
          });

          assert.ok(measured.scroll <= width, `${screen}/${scheme}/${width}: sem overflow horizontal`);
          assert.ok(measured.font.includes("Plus Jakarta Sans"), `${screen}: fonte Plus Jakarta Sans ativa`);
          assert.notEqual(measured.bodyBg, "rgb(255, 255, 255)", `${screen}: proibido #FFF puro`);
          assert.notEqual(measured.bodyBg, "rgb(0, 0, 0)", `${screen}: proibido #000 puro`);

          if (["mesa", "pwa"].includes(screen)) styles[screen] = measured;

          if (screen === "mesa") {
            assert.equal(
              await page.locator(".ops-sidebar").count(),
              0,
              "/mesa/:token nunca renderiza sidebar",
            );
          }

          if (["admin", "cozinha", "bar", "caixa"].includes(screen)) {
            if (width >= 1024) {
              // Move mouse away first so sidebar is in collapsed resting state
              await page.mouse.move(700, 200);
              await page.waitForTimeout(80);
              const sidebar = await inViewport(page, page.locator(".ops-sidebar"));
              assert.equal(sidebar.x, 0);
              assert.equal(Math.round(sidebar.width), 72, "Sidebar recolhida = 72px");
              assert.equal(sidebar.height, 900);
              const mainBefore = await page.locator(".ops-main").boundingBox();
              assert.ok(mainBefore.x >= 71, `${screen}/${scheme}: main x=${mainBefore.x}`);

              // O dock permanece compacto no hover; só o rótulo do ícone aparece.
              const navItem = page.locator(".ops-nav-item").first();
              await navItem.hover();
              await page.waitForTimeout(80);
              const sidebarHover = await page.locator(".ops-sidebar").boundingBox();
              const mainAfter = await page.locator(".ops-main").boundingBox();
              assert.equal(Math.round(sidebarHover.width), 72, "Dock permanece em 72px no hover");
              assert.equal(
                Math.round(mainAfter.x),
                Math.round(mainBefore.x),
                "Hover do dock não causa reflow no conteúdo",
              );
              const tooltip = await navItem.evaluate((el) => getComputedStyle(el, "::after"));
              assert.equal(tooltip.opacity, "1", "Rótulo aparece como tooltip no hover");
              assert.equal(tooltip.backgroundColor, "rgba(0, 0, 0, 0)", "Tooltip sem fundo");
              await page.mouse.move(700, 200);
            }
            await inViewport(page, page.getByRole("button", { name: /Ativar tema/ }));
          }

          if (screen === "admin") {
            await page.locator(".dash-chart__track").first().waitFor();
            await aguardarLayoutDashboard(page, width);
            assert.equal(await page.locator(".metric-value").count(), 12);
            const cortadas = await page.locator(".metric-value").evaluateAll((values) => values
              .filter((el) => el.scrollWidth > el.clientWidth)
              .map((el) => ({ texto: el.textContent, scroll: el.scrollWidth, largura: el.clientWidth })));
            assert.deepEqual(cortadas, [], `${scheme}/${width}: métricas não cortam valores`);
            const tracks = page.locator(".dash-chart__track");
            assert.equal(await tracks.count(), 7);
            assert.ok((await tracks.first().boundingBox()).height > 100);
          }

          if (screen === "pwa") {
            assert.equal(await page.locator(".app-header").count(), 0, "sem cabeçalho fixo");
            const footer = await inViewport(page, page.locator(".app-footer"));
            assert.ok(
              footer.y + footer.height <= 900 + 1,
              "rodapé encostado na base da viewport",
            );
            const conexao = await inViewport(page, page.locator("#connection"));
            const syncBtn = await inViewport(page, page.locator("#syncBtn"));
            assert.ok(
              syncBtn.x >= conexao.x + conexao.width - 2,
              "#syncBtn fica imediatamente à direita de #connection",
            );
            for (const id of ["#themeToggleBtn", "#helpBtn", "#openNotificationSettings"]) {
              await inViewport(page, page.locator(id));
            }
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
          await page.getByRole("button", { name: "Ver Burger da casa", exact: true }).click();
          await inViewport(page, page.getByRole("dialog"));
          await page.getByRole("button", { name: "Fechar", exact: true }).click();
        }

        if (screen === "pwa") {
          // Testa cards expansíveis em Entregas (2 pedidos prontos simulados)
          await page.locator('[data-tab="deliveries"]').click();
          await page.locator("#readyOrders .order").first().waitFor();
          assert.equal(await page.locator("#readyOrders .order").count(), 2);
          /* O acordeão é exclusivo: abrir um cartão fecha o outro.
             Duas armadilhas de corrida, ambas observadas no CI:
               1) clicar logo após o clique anterior cai num nó já substituído
                  pelo re-render, e o segundo clique nunca é processado;
               2) ler o atributo externamente logo após o waitForFunction pode
                  pegar outro re-render e falhar com 'false' !== 'true'.
             Por isso: esperar o cartão ficar estável (bounding box e atributo
             iguais em dois frames) antes de clicar, e verificar o estado DENTRO
             da própria waitForFunction, para que a asserção e a espera sejam o
             mesmo instante observado. */
          const esperarAria = async (indice, valor) => {
            try {
              await page.waitForFunction(
                ([i, v]) =>
                  document.querySelectorAll("#readyOrders .order-summary")[i]?.getAttribute("aria-expanded") === v,
                [indice, valor],
                { timeout: 15000 },
              );
            } catch (erro) {
              const atual = await page
                .locator("#readyOrders .order-summary")
                .nth(indice)
                .getAttribute("aria-expanded")
                .catch(() => "<ausente>");
              throw new Error(
                `acordeão: cartão ${indice} deveria ficar aria-expanded="${valor}", mas está "${atual}" (` +
                  `total de cartões: ${await page.locator("#readyOrders .order-summary").count().catch(() => "?")})`,
              );
            }
          };

          /** Clica sem correr contra o re-render: espera o nó estabilizar. */
          const clicarEstavel = async (locator) => {
            for (let tentativa = 0; tentativa < 5; tentativa++) {
              const antes = await locator.boundingBox();
              const ariaAntes = await locator.getAttribute("aria-expanded");
              await page.waitForTimeout(60);
              const depois = await locator.boundingBox();
              const ariaDepois = await locator.getAttribute("aria-expanded");
              if (
                antes &&
                depois &&
                antes.x === depois.x &&
                antes.y === depois.y &&
                ariaAntes === ariaDepois
              ) {
                break;
              }
            }
            await locator.click();
          };
          const firstSummary = page.locator("#readyOrders .order-summary").nth(0);
          const secondSummary = page.locator("#readyOrders .order-summary").nth(1);
          assert.equal(await firstSummary.getAttribute("aria-expanded"), "false");
          assert.equal(await secondSummary.getAttribute("aria-expanded"), "false");
          await clicarEstavel(firstSummary);
          await esperarAria(0, "true");
          await clicarEstavel(secondSummary);
          await esperarAria(1, "true");
          await esperarAria(0, "false");
          await clicarEstavel(secondSummary);
          await esperarAria(1, "false");

          for (const tab of ["orders", "deliveries", "billing", "tables"]) {
            await page.locator(`[data-tab="${tab}"]`).click();
            assert.equal(await page.locator(".page.active").getAttribute("data-page"), tab);
          }
          // As ações de uma mesa ficam no modal do salão; a lista duplicada foi removida.
          await page.locator("#tableSearch").fill("Marina");
          await page.locator("#tableGrid .table-tile").first().click();
          await page.locator("#tableDetailsModal[open]").waitFor();
          for (const label of ["Ver pedidos", "Cobrar", "Transferir mesa", "Deixar mesa"]) {
            assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 1, `mesa responsável: ${label}`);
          }
          await page.locator("#closeTableDetails").click();

          await page.locator("#tableSearch").fill("3");
          await page.locator("#tableGrid .table-tile").first().click();
          await page.locator("#tableDetailsModal[open]").waitFor();
          assert.equal(await page.getByRole("button", { name: "Assumir mesa", exact: true }).count(), 1, "pedido QR sem responsável pode ser assumido");
          assert.equal(await page.getByRole("button", { name: "Transferir mesa", exact: true }).count(), 0, "mesa sem responsável não oferece transferência");
          await page.locator("#closeTableDetails").click();

          await page.locator("#tableSearch").fill("12");
          await page.locator("#tableGrid .table-tile").first().click();
          await page.locator("#tableDetailsModal[open]").waitFor();
          assert.equal(await page.getByRole("button", { name: "Iniciar atendimento", exact: true }).count(), 1, "mesa sem pedido QR inicia atendimento");
          assert.equal(await page.getByRole("button", { name: "Assumir mesa", exact: true }).count(), 0);
          await page.locator("#closeTableDetails").click();

          await page.setViewportSize({ width: 375, height: 900 });
          await page.locator("#newOrderTables").click();
          const box = await inViewport(page, page.locator("#orderModal"));
          assert.ok(box.y > 0 && box.y + box.height < 900, "Diálogo centralizado com margens");
          await page.locator("#closeOrder").click();
        }
      }

      assert.equal(styles.mesa.surface, styles.pwa.surface, "Mesa/PWA: mesmo token --surface");
      assert.equal(styles.mesa.raised, styles.pwa.raised, "Mesa/PWA: mesmo token --surface-raised");
      assert.deepEqual(errors, [], "Sem erros de execução");

      // Preferência explícita prevalece sobre o SO
      await page.evaluate(() => localStorage.setItem("qradmin-tema", "claro"));
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(base + "/garcom-pwa/?token=visual");
      assert.equal(await page.locator("html").getAttribute("data-theme"), "claro");
      await page.evaluate(() => localStorage.setItem("qradmin-tema", "escuro"));
      await page.emulateMedia({ colorScheme: "light" });
      await page.reload();
      assert.equal(await page.locator("html").getAttribute("data-theme"), "escuro");
      await context.close();
    }

    // Shell offline real: Service Worker precacheia tokens, Fraunces, Plus Jakarta Sans, JetBrains Mono e ícones
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
    assert.equal(await page.locator("html").getAttribute("data-theme"), "escuro");
    assert.ok(await page.evaluate(() => document.fonts.check('700 20px "Fraunces"')));
    assert.ok(await page.evaluate(() => document.fonts.check('600 15px "Plus Jakarta Sans"')));
    assert.ok(await page.evaluate(() => document.fonts.check('600 13px "JetBrains Mono"')));
    // A marca continua no shell offline: agora ela vive no painel de ajuda do rodapé.
    assert.equal(await page.locator(".app-header").count(), 0, "sem cabeçalho para precachear");
    await page.locator("#helpBtn").click();
    await page.locator(".brand-mark").waitFor({ state: "visible" });
    assert.equal(
      await page.locator(".brand-mark").evaluate((img) => img.complete && img.naturalWidth > 0),
      true,
    );
    await offline.close();
    console.log(`✓ ${layouts} layouts, temas, dock fixo em 72px com tooltip, cards expansíveis e shell offline validados.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
