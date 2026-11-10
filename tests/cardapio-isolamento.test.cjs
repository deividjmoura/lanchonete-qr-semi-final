"use strict";

/**
 * Isolamento do cardápio do cliente (#/mesa/:token).
 *
 * O rebranding "Passe" trocou a identidade do produto inteiro, menos a do
 * cardápio do cliente, que precisa continuar exatamente como era. O SPA entrega
 * UM arquivo de estilo para todas as rotas, então a garantia tem duas metades:
 *
 *   - dinâmica: `npm run test:cardapio-intacto` abre o cardápio do build de
 *     referência e do build atual em Chromium e compara marcação, estilo
 *     computado, pixels e downloads, estado por estado;
 *   - estática (esta suíte): nenhuma regra da identidade nova consegue alcançar
 *     um elemento do cardápio — inclusive nos estados que a prova dinâmica não
 *     visita (foco por teclado, movimento normal, telas de erro).
 *
 * O critério de "pode alcançar" mora em scripts/lib/arvore-do-cardapio.mjs e é
 * conservador de propósito: sobra regra presa, nunca falta.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync, spawnSync } = require("node:child_process");
const postcss = require("postcss");
const ts = require("typescript");

const RAIZ = path.join(__dirname, "..");
const ler = (arquivo) => fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
const lerOuNada = (arquivo) => {
  try {
    return ler(arquivo);
  } catch {
    return null;
  }
};
const semComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const CONGELADO = "src/screens/cardapio-identidade/identidade-cardapio.css";
const DO_CARDAPIO = [CONGELADO, "src/screens/mesa-praia.css"];
const TOKENS = "public/garcom-pwa/design-tokens.css";
const INDEX = "src/index.css";
const GUARDA = 'html:not([data-identidade="cardapio"])';

function cssDoSpa() {
  const achados = [];
  const andar = (pasta) => {
    for (const item of fs.readdirSync(path.join(RAIZ, pasta), { withFileTypes: true })) {
      const caminho = `${pasta}/${item.name}`;
      if (item.isDirectory()) andar(caminho);
      else if (item.name.endsWith(".css")) achados.push(caminho);
    }
  };
  andar("src");
  return [...achados, TOKENS].sort();
}

const arvore = () => import("../scripts/lib/arvore-do-cardapio.mjs");

async function vocabularioDoCardapio() {
  const { fontesDoCardapio, vocabularioDe } = await arvore();
  const fontes = fontesDoCardapio(lerOuNada);
  return { fontes, vocabulario: vocabularioDe([...fontes.values()]) };
}

const referencia = () => {
  const m = /COMMIT_DE_REFERENCIA = "([0-9a-f]{40})"/.exec(ler("scripts/gerar-identidade-cardapio.mjs"));
  assert.ok(m, "o gerador precisa declarar COMMIT_DE_REFERENCIA");
  return m[1];
};
const referenciaDisponivel = () => {
  try {
    execFileSync("git", ["cat-file", "-e", `${referencia()}^{commit}`], { cwd: RAIZ, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------------- */

test("a identidade congelada do cardápio é exatamente a do commit de referência", (t) => {
  if (!referenciaDisponivel()) {
    const aviso =
      `commit de referência ${referencia().slice(0, 12)} indisponível neste clone (raso). ` +
      `Rode \`git fetch --depth=1 origin ${referencia()}\` para habilitar a conferência.`;
    // No CI a conferência é obrigatória: pular em silêncio desligaria a guarda.
    assert.ok(!process.env.CI, aviso);
    t.skip(aviso);
    return;
  }
  const r = spawnSync(process.execPath, ["scripts/gerar-identidade-cardapio.mjs", "--conferir"], { cwd: RAIZ, encoding: "utf8" });
  assert.equal(
    r.status,
    0,
    `identidade-cardapio.css é um arquivo GERADO e não confere com a referência. ` +
      `Não edite à mão; rode \`node scripts/gerar-identidade-cardapio.mjs\`.\n${r.stderr || r.stdout}`,
  );
  /* O mesmo comando também exige que as regras que as duas identidades dividem
     (interação universal em design-tokens.css, `@layer base` e a ponte `@theme`
     de index.css) continuem idênticas às da referência. */
  assert.match(r.stdout, /confere com/);
});

test("nenhuma regra fora dos arquivos do cardápio consegue casar com um elemento dele", async () => {
  const { podeCasarNoCardapio, seletoresDe } = await arvore();
  const { vocabulario } = await vocabularioDoCardapio();
  assert.deepEqual(
    [...vocabulario.desconhecidos],
    [],
    "há texto montado em tempo de execução que ninguém classificou como classe ou não-classe (NAO_E_CLASSE em scripts/lib/arvore-do-cardapio.mjs)",
  );

  const invasoras = [];
  let conferidas = 0;
  for (const arquivo of cssDoSpa()) {
    if (DO_CARDAPIO.includes(arquivo) || arquivo === TOKENS || arquivo === INDEX) continue;
    for (const { seletor, contexto } of seletoresDe(ler(arquivo))) {
      conferidas += 1;
      if (seletor.includes(GUARDA)) continue;
      if (!podeCasarNoCardapio(seletor, vocabulario)) continue;
      invasoras.push(`${arquivo}: ${contexto ? contexto + " " : ""}${seletor}`);
    }
  }
  assert.ok(conferidas > 500, `esperava conferir os seletores do SPA inteiro, conferi ${conferidas}`);
  assert.deepEqual(
    invasoras,
    [],
    "estas regras alcançam o cardápio do cliente. Prenda cada uma a uma classe que só exista fora dele " +
      `ou a :where(${GUARDA}) (como em src/styles/passe.css):\n  ${invasoras.join("\n  ")}`,
  );
});

test("o critério estático reconhece invasoras: seletores de elemento, de classe do cardápio e aninhados", async () => {
  const { podeCasarNoCardapio, seletoresDe } = await arvore();
  const { vocabulario } = await vocabularioDoCardapio();
  const amostra = `
    button { color: red; }
    .qr-button:hover { color: red; }
    .mesa-praia-superficie .card-produto { color: red; }
    @media (min-width: 600px) { a[href] { color: red; } }
    .landing-root { button { color: red; } .hero__title { color: red; } }
    :where(${GUARDA}) { button { color: red; } }
    .ops-shell .qr-button { color: red; }
  `;
  const resultado = seletoresDe(amostra).map(({ seletor }) => [seletor, !seletor.includes(GUARDA) && podeCasarNoCardapio(seletor, vocabulario)]);
  assert.deepEqual(Object.fromEntries(resultado), {
    button: true,
    ".qr-button:hover": true,
    ".mesa-praia-superficie .card-produto": true,
    "a[href]": true,
    ".landing-root": false,
    ".landing-root button": false,
    ".landing-root .hero__title": false,
    [`:where(${GUARDA})`]: false,
    [`:where(${GUARDA}) button`]: false,
    ".ops-shell .qr-button": false,
  });
});

test("design-tokens.css só entrega ao cardápio tokens e as regras universais de interação", () => {
  const raiz = postcss.parse(ler(TOKENS));
  const estranhos = [];
  const conferir = (no, contexto) => {
    if (no.type === "comment") return;
    if (no.type === "atrule" && no.name === "font-face") return;
    if (no.type === "atrule" && no.name === "media") {
      no.each((filho) => conferir(filho, `@media ${no.params}`));
      return;
    }
    if (no.type === "rule") {
      const declaracoes = [];
      no.walkDecls((d) => declaracoes.push(d.prop));
      /* `color-scheme` acompanha o tema desde antes do rebranding; no cardápio
         vence o bloco congelado (mais específico) e o valor inline do
         theme-init.js. */
      const soTokens = declaracoes.length > 0 && declaracoes.every((prop) => prop.startsWith("--") || prop === "color-scheme");
      /* As três regras `:where(a, button, …)` são as mesmas de antes do
         rebranding e leem tokens: no cardápio resolvem para os valores dele.
         A conferência com a referência (primeiro teste) impede que mudem. */
      const universal = /^:where\((?:a|button)\b/.test(no.selector.trim());
      if (!soTokens && !universal) estranhos.push(`${contexto} ${no.selector}`.trim());
      return;
    }
    estranhos.push(`${contexto} @${no.name} ${no.params}`.trim());
  };
  raiz.each((no) => conferir(no, ""));
  assert.deepEqual(
    estranhos,
    [],
    "design-tokens.css também é carregado no cardápio do cliente: além de tokens e @font-face, não pode ganhar regra nova. " +
      `Regras da identidade vão para src/styles/passe.css. Encontrado:\n  ${estranhos.join("\n  ")}`,
  );
});

test("index.css só importa, faz a ponte de tokens e mantém a camada base", () => {
  const css = ler(INDEX);
  const raiz = postcss.parse(css);
  const topo = [];
  raiz.each((no) => {
    if (no.type === "comment") return;
    topo.push(no.type === "atrule" ? `@${no.name} ${no.type === "atrule" && ["layer", "theme"].includes(no.name) ? no.params : ""}`.trim() : `regra ${no.selector}`);
  });
  const permitidos = new Set(["@import", "@source", "@custom-variant", "@theme", "@layer base"]);
  const sobras = topo.filter((item) => !permitidos.has(item));
  assert.deepEqual(
    sobras,
    [],
    "src/index.css vale para todas as rotas, cardápio incluído: não pode ter regra global solta. " +
      `Regra nova de identidade vai para src/styles/passe.css. Encontrado: ${sobras.join(" · ")}`,
  );

  /* Ordem dos imports: os tokens novos primeiro, a identidade congelada do
     cardápio depois (ela vence os empates), as regras da Passe por último. */
  const ordem = [...css.matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ordem, [
    "tailwindcss",
    "../public/garcom-pwa/design-tokens.css",
    "./screens/cardapio-identidade/identidade-cardapio.css",
    "./styles/passe.css",
  ]);
});

test("a identidade congelada só vale dentro do cardápio", async () => {
  const { seletoresDe } = await arvore();
  const fora = seletoresDe(ler(CONGELADO))
    .map(({ seletor }) => seletor)
    .filter((seletor) => !seletor.includes('[data-identidade="cardapio"]'));
  assert.deepEqual(fora, [], `regras da identidade antiga sem a chave do cardápio vazariam para o produto novo:\n  ${fora.join("\n  ")}`);
});

test("o cardápio não consome nenhum token que só a identidade nova define", async () => {
  const declarados = (css) => new Set([...semComentarios(css).matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const consumidos = (texto) => new Set([...texto.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));

  const daPasse = declarados(ler(TOKENS));
  const doCardapio = new Set([...declarados(ler(CONGELADO)), ...declarados(ler("src/screens/mesa-praia.css"))]);
  const soDaPasse = new Set([...daPasse].filter((nome) => !doCardapio.has(nome)));
  assert.ok(soDaPasse.size > 10, "esperava encontrar os tokens próprios da identidade Passe");
  assert.ok(doCardapio.size > 200, "esperava encontrar os tokens congelados do cardápio");

  /* 1. o que os estilos do cardápio leem com var() */
  const vazamentos = [];
  for (const arquivo of DO_CARDAPIO) {
    for (const nome of consumidos(semComentarios(ler(arquivo)))) {
      if (soDaPasse.has(nome)) vazamentos.push(`${arquivo} lê ${nome}`);
    }
  }
  /* 2. o que o código que desenha o cardápio lê com var() ou cita pelo nome */
  const { fontes, vocabulario } = await vocabularioDoCardapio();
  for (const [arquivo, texto] of fontes) {
    for (const nome of new Set([...texto.matchAll(/--[a-z][\w-]*/g)].map((m) => m[0]))) {
      if (soDaPasse.has(nome)) vazamentos.push(`${arquivo} cita ${nome}`);
    }
  }
  /* 3. utilitários Tailwind cuja ponte (@theme) aponta para um token só da Passe:
        `--color-plaque: var(--plaque)` gera `bg-plaque`, `text-plaque`… */
  const ponte = [];
  postcss.parse(ler(INDEX)).walkAtRules("theme", (tema) =>
    tema.walkDecls((d) => {
      const alvo = /var\(\s*(--[\w-]+)/.exec(d.value);
      const chave = /^--(?:color|font|radius|shadow)-(.+)$/.exec(d.prop);
      if (alvo && chave && soDaPasse.has(alvo[1])) ponte.push({ utilitario: chave[1], token: alvo[1] });
    }),
  );
  assert.ok(ponte.length >= 10, "esperava encontrar na ponte @theme os acréscimos da identidade Passe");
  for (const palavra of vocabulario.palavras) {
    const classe = palavra.split(":").pop().replace(/\/\d+$/, "");
    for (const { utilitario, token } of ponte) {
      if (classe.endsWith(`-${utilitario}`)) vazamentos.push(`o código do cardápio usa a classe "${palavra}", que lê ${token}`);
    }
  }
  assert.deepEqual(
    vazamentos,
    [],
    "o cardápio do cliente passaria a depender de um token que não existia antes do rebranding:\n  " + vazamentos.join("\n  "),
  );
});

test("nomes globais do CSS (animações, famílias de fonte, camadas) não colidem com os do cardápio", () => {
  const nomes = (css, regex) => new Set([...semComentarios(css).matchAll(regex)].map((m) => m[1].trim().replace(/^["']|["']$/g, "")));
  const KEYFRAMES = /@keyframes\s+([\w-]+)/g;
  const FAMILIA = /@font-face\s*\{[^}]*?font-family:\s*([^;]+);/g;

  const animacoesDoCardapio = new Set();
  const familiasDoCardapio = new Set();
  for (const arquivo of DO_CARDAPIO) {
    for (const n of nomes(ler(arquivo), KEYFRAMES)) animacoesDoCardapio.add(n);
    for (const n of nomes(ler(arquivo), FAMILIA)) familiasDoCardapio.add(n);
  }
  assert.ok(animacoesDoCardapio.size > 0 && familiasDoCardapio.size > 0, "o cardápio tem animações e famílias próprias");

  const colisoes = [];
  for (const arquivo of cssDoSpa()) {
    if (DO_CARDAPIO.includes(arquivo)) continue;
    const css = ler(arquivo);
    for (const n of nomes(css, KEYFRAMES)) if (animacoesDoCardapio.has(n)) colisoes.push(`${arquivo}: @keyframes ${n}`);
    for (const n of nomes(css, FAMILIA)) if (familiasDoCardapio.has(n)) colisoes.push(`${arquivo}: @font-face "${n}"`);
    /* @property registra a custom property para o documento inteiro. */
    if (/@property\s+--/.test(semComentarios(css))) colisoes.push(`${arquivo}: @property (vale para o documento inteiro)`);
    /* Uma camada nova mudaria a ordem da cascata do Tailwind em todas as rotas. */
    for (const n of nomes(css, /@layer\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s*[;{]/g)) {
      for (const camada of n.split(",").map((c) => c.trim())) {
        if (!["theme", "base", "components", "utilities"].includes(camada)) colisoes.push(`${arquivo}: @layer ${camada}`);
      }
    }
  }
  assert.deepEqual(
    colisoes,
    [],
    "estes nomes são globais no CSS e mudariam o cardápio do cliente:\n  " + colisoes.join("\n  "),
  );
});

test("a rota do cardápio é reconhecida do mesmo jeito antes do primeiro paint, no roteador e no React", () => {
  /* src/lib/identidade.ts, transpilado */
  const js = ts.transpileModule(ler("src/lib/identidade.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const modulo = { exports: {} };
  new Function("module", "exports", "require", js)(modulo, modulo.exports, require);
  const { rotaEhCardapio } = modulo.exports;
  assert.equal(typeof rotaEhCardapio, "function");

  /* public/garcom-pwa/theme-init.js, executado com um documento de mentira */
  const fonte = ler("public/garcom-pwa/theme-init.js");
  const noInicio = (hash, pathname = "/") => {
    const atributos = new Map();
    const sandbox = {
      localStorage: { getItem: () => null },
      location: { hash, pathname },
      document: {
        documentElement: {
          setAttribute: (nome, valor) => atributos.set(nome, valor),
          classList: { toggle() {} },
          style: {},
        },
        querySelector: () => null,
      },
    };
    sandbox.window = { matchMedia: () => ({ matches: false }) };
    vm.runInNewContext(fonte, sandbox);
    return atributos.get("data-identidade") === "cardapio";
  };

  const casos = {
    "": false,
    "#": false,
    "#/": false,
    "#/login": false,
    "#/mesa": true,
    "#/mesa/": true,
    "#/mesa/abc-123": true,
    "#mesa/abc-123": true,
    "#//mesa/abc-123": true,
    "#/mesa/abc-123?origem=qr": true,
    "#/mesa?x=1": true,
    "#/mesas/abc": false,
    "#/Mesa/abc": false,
    "#/admin/mesas": false,
    "#/garcom/abc-123": false,
    "#/caixa": false,
  };
  for (const [hash, esperado] of Object.entries(casos)) {
    assert.equal(rotaEhCardapio(hash), esperado, `identidade.ts: ${JSON.stringify(hash)}`);
    assert.equal(noInicio(hash), esperado, `theme-init.js: ${JSON.stringify(hash)}`);
  }
  /* O PWA do garçom usa o mesmo theme-init.js e nunca é o cardápio. */
  assert.equal(noInicio("#/mesa/abc-123", "/garcom-pwa/"), false);
  assert.equal(noInicio("#/mesa/abc-123", "/garcom-pwa/index.html"), false);

  /* O roteador decide pela mesma primeira parte do hash, e é ela que o App
     usa para avisar os componentes compartilhados. */
  assert.match(ler("src/router.tsx"), /return \{ path: segs\[0\] \|\| "home", params \};/);
  assert.match(
    ler("src/App.tsx"),
    /<IdentidadeContexto\.Provider value=\{rota\.path === "mesa" \? "cardapio" : "passe"\}>/,
    "App.tsx precisa informar a identidade da rota aos componentes compartilhados",
  );
});

test("componentes compartilhados não acrescentam classe nova à marcação do cardápio", () => {
  const ui = ler("src/components/ui.tsx");
  /* `qr-button` já existia antes do rebranding (mesa-praia.css depende dela). */
  const novos = ["qr-icon-button", "qr-badge", "qr-stepper", "qr-input", "qr-modal"];
  for (const gancho of novos) {
    const usos = [...ui.matchAll(new RegExp(`.{0,8}${gancho}(?![\\w-])`, "g"))].map((m) => m[0]);
    assert.ok(usos.length > 0, `${gancho} deveria existir em ui.tsx`);
    for (const uso of usos) {
      assert.match(
        uso,
        /gancho\("$|gancho\("qr-/,
        `"${gancho}" precisa passar por gancho(…) em ui.tsx: dentro do cardápio a classe não pode aparecer (ver useGancho em src/lib/identidade.ts)`,
      );
    }
  }
  const identidade = ler("src/lib/identidade.ts");
  assert.match(identidade, /useContext\(IdentidadeContexto\) === "cardapio" \? semGancho : comGancho/);

  /* Toasts e ConfirmacaoGlobal aparecem dentro do cardápio e não dependem do
     contexto: precisam continuar como eram. A prova dinâmica compara a marcação
     deles; aqui fica só o lembrete de que são parte da tela do cliente. */
  for (const arquivo of ["src/components/Toasts.tsx", "src/components/ConfirmacaoGlobal.tsx"]) {
    assert.doesNotMatch(ler(arquivo), /\b(placa|rota__|rotulo|regua|ficha|simbolo|assinatura)\b/, `${arquivo} também é desenhado no cardápio do cliente`);
  }
});
