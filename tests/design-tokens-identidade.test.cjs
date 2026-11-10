"use strict";

/**
 * Identidade visual global — "Passe".
 *
 * O passe é o balcão onde o pedido passa de uma estação à outra (mesa, cozinha,
 * bar, garçom, caixa). A identidade inteira sai dessa ideia e das três cores
 * amostradas do logotipo oficial — tinta (azul-marinho), sinal (menta) e areia
 * (dourado claro) — sobre papel quente, com uma única família tipográfica em
 * que a LARGURA faz a hierarquia.
 *
 * Esta suíte substitui a que travava a identidade anterior ("Comanda de
 * Chapa": palco escuro de vidro, brasa, três famílias de fonte).
 *
 * Contrato:
 *  1. existe uma única fonte de tokens, e é nela que a identidade é definida;
 *  2. nenhum arquivo de camada visual escreve cor literal;
 *  3. toda `var(--x)` consumida tem definição;
 *  4. os primitivos de componente (plaquinha, linha de passe, régua, ficha)
 *     existem uma vez só e são reutilizados;
 *  5. o PWA do garçom consome a mesma fonte e não mantém paleta paralela;
 *  6. a identidade anterior não volta por descuido;
 *  7. a exceção (cardápio do cliente) é explícita, isolada e documentada.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ARQUIVO_DE_TOKENS, RAIZ, ler, blocos, temaResolvido } = require("./helpers/tokens.cjs");

const tokens = ler(ARQUIVO_DE_TOKENS);
const semComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/* Tudo o que é do cardápio do cliente fica de fora: ele conserva a identidade
   anterior de propósito (ver tests/cardapio-isolamento.test.cjs). */
const DO_CARDAPIO = /^src\/screens\/(cardapio-identidade\/|mesa-praia\.css$|Mesa\.tsx$)/;

function arquivos(pasta, extensoes) {
  const saida = [];
  const andar = (dir) => {
    for (const item of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const caminho = `${dir}/${item.name}`;
      if (item.isDirectory()) andar(caminho);
      else if (extensoes.some((e) => item.name.endsWith(e)) && !DO_CARDAPIO.test(caminho)) saida.push(caminho);
    }
  };
  andar(pasta);
  return saida.sort();
}

const CAMADA_VISUAL = [...arquivos("src", [".css"]), "public/garcom-pwa/styles.css", "public/institucional.css"];
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/;

/** Remove os blocos `@media print`: papel é branco e tinta é preta, sem tema. */
function semImpressao(css) {
  let saida = "";
  let i = 0;
  for (;;) {
    const inicio = css.indexOf("@media print", i);
    if (inicio < 0) return saida + css.slice(i);
    saida += css.slice(i, inicio);
    let nivel = 0;
    let j = css.indexOf("{", inicio);
    do {
      if (css[j] === "{") nivel += 1;
      else if (css[j] === "}") nivel -= 1;
      j += 1;
    } while (nivel > 0 && j < css.length);
    i = j;
  }
}

test("camada de identidade não contém cor literal: tudo vem de token", () => {
  assert.ok(CAMADA_VISUAL.length >= 10, "esperava encontrar as folhas de estilo do produto");
  for (const arquivo of CAMADA_VISUAL) {
    const css = semImpressao(semComentarios(ler(arquivo)));
    const achado = LITERAL.exec(css);
    assert.equal(
      achado,
      null,
      `${arquivo} escreve a cor "${achado?.[0]}…" direto: use um token semântico de ${ARQUIVO_DE_TOKENS} (ou crie um)`,
    );
  }
});

test("as três cores do logotipo e o papel são os primitivos da identidade", () => {
  const { primitivos } = blocos();
  assert.equal(primitivos.get("--passe-tinta-700"), "#0c2c4c", "tinta: o azul-marinho do símbolo");
  assert.equal(primitivos.get("--passe-sinal-400"), "#6cdccc", 'sinal: a menta do "QR"');
  assert.equal(primitivos.get("--passe-areia-300"), "#e4cc94", "areia: o dourado claro do traço");
  assert.equal(primitivos.get("--passe-papel-100"), "#f4efe6", "papel: o fundo quente");

  const { claro, escuroEscolhido } = blocos();
  // Tema claro é papel com tinta; tema escuro é tinta com sinal.
  assert.equal(claro.get("--surface"), "var(--passe-papel-100)");
  assert.equal(claro.get("--brand"), "var(--passe-tinta-700)");
  assert.equal(claro.get("--plaque"), "var(--passe-tinta-700)");
  assert.equal(escuroEscolhido.get("--surface"), "var(--passe-tinta-900)");
  assert.equal(escuroEscolhido.get("--brand"), "var(--passe-sinal-400)");
  assert.equal(escuroEscolhido.get("--plaque"), "var(--passe-areia-300)");
  // A faixa de tinta (barra lateral, rodapé do PWA) é azul-marinho nos dois temas.
  for (const tema of ["claro", "escuro"]) {
    const t = temaResolvido(tema);
    assert.match(t["--ink-band"], /^#0[0-9a-f]{5}$/, `${tema}: --ink-band é tinta escura`);
    assert.equal(t["--ink-band-signal"], "#6cdccc", `${tema}: o sinal acende sobre a tinta`);
  }
  // Primitivos só são citados dentro do arquivo de tokens. Única exceção: o
  // centro do símbolo, que é sempre a menta do logotipo, em qualquer tema.
  for (const arquivo of CAMADA_VISUAL) {
    if (arquivo === "src/index.css") continue;
    const usados = [...semComentarios(ler(arquivo)).matchAll(/var\(\s*(--passe-[\w-]+)/g)].map((m) => m[1]);
    const admitidos = arquivo === "src/styles/passe.css" ? ["--passe-sinal-400"] : [];
    assert.deepEqual(usados, admitidos, `${arquivo} cita primitivo de paleta: use o token semântico`);
  }
  assert.match(semComentarios(ler("src/styles/passe.css")), /\.simbolo__centro \{\s*fill: var\(--passe-sinal-400\);/);
});

test("os tokens semânticos cobrem os dois temas com os mesmos nomes", () => {
  const { claro, escuroEscolhido, escuroSistema } = blocos();
  const nomes = (mapa) => [...mapa.keys()].sort();
  assert.ok(claro.size > 60, "bloco do tema claro");
  assert.deepEqual(nomes(escuroEscolhido), nomes(claro), "o tema escuro define exatamente os mesmos tokens do claro");
  // Quem segue o sistema operacional e quem escolheu no botão veem o mesmo escuro.
  assert.deepEqual([...escuroSistema], [...escuroEscolhido], "os dois blocos do tema escuro precisam ser idênticos");
  for (const exigido of [
    "--surface", "--surface-raised", "--surface-sunken", "--surface-hover", "--surface-sidebar", "--surface-overlay",
    "--text", "--text-muted", "--text-subtle",
    "--brand", "--brand-hover", "--brand-contrast", "--brand-ink", "--brand-surface", "--brand-border",
    "--accent", "--accent-ink", "--accent-surface", "--accent-border",
    "--line", "--line-strong", "--focus-ring",
    "--plaque", "--plaque-text", "--plaque-label",
    "--route", "--route-active",
    "--ink-band", "--ink-band-text", "--ink-band-muted", "--ink-band-line", "--ink-band-signal",
    "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5",
    "--qr-paper", "--qr-ink", "--qr-border",
    "--shadow-card", "--shadow-card-hover", "--shadow-modal",
  ]) {
    assert.ok(claro.has(exigido), `token ${exigido} precisa existir`);
  }
  for (const estado of ["success", "warning", "info", "danger"]) {
    for (const sufixo of ["", "-ink", "-contrast", "-surface", "-border"]) {
      assert.ok(claro.has(`--status-${estado}${sufixo}`), `token --status-${estado}${sufixo}`);
    }
  }
});

test("uma família tipográfica, quatro larguras", () => {
  const { primitivos } = blocos();
  for (const nome of ["--font-sans", "--font-display", "--font-mono"]) {
    assert.match(primitivos.get(nome), /^"Archivo", ui-sans-serif/, `${nome} é Archivo com reserva do sistema`);
  }
  // Código de verdade (chaves, segredos) usa a mono do sistema: não se baixa outra família.
  assert.match(primitivos.get("--font-code"), /^ui-monospace/);
  assert.equal(primitivos.get("--wdth-display"), "118%", "larga para a voz");
  assert.equal(primitivos.get("--wdth-title"), "110%", "um degrau acima do normal para o título");
  assert.equal(primitivos.get("--wdth-text"), "100%", "normal para a leitura");
  assert.equal(primitivos.get("--wdth-data"), "80%", "estreita para o dado");

  const faces = [...tokens.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(faces.length, 1, "uma única @font-face");
  assert.match(faces[0], /font-family: "Archivo"/);
  assert.match(faces[0], /url\("\.\/fonts\/archivo-latin-wdth-normal\.woff2"\) format\("woff2-variations"\)/);
  assert.match(faces[0], /font-stretch: 62% 125%/, "o eixo de largura precisa estar declarado");
  assert.match(faces[0], /font-weight: 100 900/);
  assert.match(faces[0], /font-display: swap/);

  const fonte = path.join(RAIZ, "public/garcom-pwa/fonts/archivo-latin-wdth-normal.woff2");
  assert.ok(fs.existsSync(fonte), "a fonte é servida pelo próprio produto");
  assert.ok(fs.statSync(fonte).size <= 100 * 1024, "orçamento de fonte: até 100 KB");
  assert.ok(fs.existsSync(path.join(RAIZ, "public/garcom-pwa/fonts/OFL.txt")), "a licença acompanha a fonte");
  assert.doesNotMatch(ler("index.html"), /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test("forma: cantos curtos, régua de 1px e cartão plano", () => {
  const { primitivos, claro } = blocos();
  assert.deepEqual(
    ["--radius-xs", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl"].map((n) => primitivos.get(n)),
    ["3px", "5px", "8px", "10px", "12px"],
  );
  assert.equal(primitivos.get("--rule"), "1px");
  // A "sombra" do cartão é a espessura da folha: deslocamento sem desfoque.
  assert.match(claro.get("--shadow-card"), /^0 1px 0 0 var\(--passe-/);
  assert.match(claro.get("--shadow-card-hover"), /^0 2px 0 0 var\(--passe-/);
  for (const arquivo of CAMADA_VISUAL) {
    assert.doesNotMatch(semComentarios(ler(arquivo)), /backdrop-filter/, `${arquivo}: a identidade não usa vidro`);
  }
  for (const grupo of [
    ["--space-1", "--space-9"],
    ["--dur-fast", "--dur-base", "--dur-slow"],
    ["--ease-snap", "--ease-out", "--ease-in-out"],
    ["--sidebar-collapsed", "--touch-min"],
  ]) {
    for (const nome of grupo) assert.ok(primitivos.has(nome), `token ${nome}`);
  }
  assert.match(tokens, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,200}--dur-base: 0ms/);
});

test("nenhum texto do produto fica abaixo de 11px", () => {
  const pequenos = [];
  const emPx = (valor, unidade) => (unidade === "rem" || unidade === "em" ? Number(valor) * 16 : Number(valor));
  for (const arquivo of CAMADA_VISUAL) {
    for (const m of semComentarios(ler(arquivo)).matchAll(/font-size:\s*([\d.]+)(px|rem)\b/g)) {
      if (emPx(m[1], m[2]) < 11) pequenos.push(`${arquivo}: font-size: ${m[1]}${m[2]}`);
    }
  }
  // ConfirmacaoGlobal.tsx também aparece no cardápio do cliente; a marcação
  // dele não pode mudar. O tamanho é corrigido em passe.css, fora do cardápio.
  const VESTIDOS_EM_CSS = new Set(["src/components/ConfirmacaoGlobal.tsx"]);
  assert.match(
    semComentarios(ler("src/styles/passe.css")),
    /\.qr-modal\[aria-labelledby="confirmacao-titulo"\] p\.uppercase \{\s*font-size: 11px;/,
    "passe.css precisa elevar o rótulo da confirmação para 11px",
  );
  for (const arquivo of arquivos("src", [".tsx"])) {
    if (VESTIDOS_EM_CSS.has(arquivo)) continue;
    for (const m of ler(arquivo).matchAll(/\btext-\[([\d.]+)(px|rem)\]/g)) {
      if (emPx(m[1], m[2]) < 11) pequenos.push(`${arquivo}: text-[${m[1]}${m[2]}]`);
    }
    for (const m of ler(arquivo).matchAll(/fontSize:\s*["'`]?([\d.]+)(px|rem)?/g)) {
      if (emPx(m[1], m[2] || "px") < 11) pequenos.push(`${arquivo}: fontSize ${m[1]}${m[2] || ""}`);
    }
  }
  assert.deepEqual(pequenos, [], "o rótulo de 11px é o menor texto da identidade");
});

test("separador é linha contínua; tracejado só marca o que está vazio ou recebe algo", () => {
  const separadores = [];
  for (const arquivo of arquivos("src", [".tsx"])) {
    for (const m of ler(arquivo).matchAll(/\b(?:border-[tbxylr] border-dashed|divide-dashed|border-dotted|divide-dotted)\b/g)) {
      separadores.push(`${arquivo}: ${m[0]}`);
    }
  }
  assert.deepEqual(separadores, [], "régua tracejada era a marca da identidade anterior");
  // Em CSS, o tracejado aparece só nos três lugares funcionais conhecidos.
  const tracejados = [];
  for (const arquivo of CAMADA_VISUAL) {
    const css = semComentarios(ler(arquivo));
    for (const m of css.matchAll(/([^{}]+)\{[^{}]*\b(?:dashed|dotted)\b[^{}]*\}/g)) {
      tracejados.push(`${arquivo}: ${m[1].trim().replace(/\s+/g, " ")}`);
    }
  }
  assert.deepEqual(
    tracejados.sort(),
    [
      "src/screens/dashboard.css: .dash-mesas__empty",
      "src/screens/dashboard.css: .dashboard-grid__preview",
      "src/screens/dashboard.css: .indicador--editing, .dashboard-widget--editing",
    ],
    "tracejado novo em CSS: confirme que é estado vazio ou alvo de arrastar e atualize esta lista",
  );
});

test("toda var() consumida no SPA e no PWA tem definição", () => {
  const { primitivos, claro } = blocos();
  const definidos = new Set([...primitivos.keys(), ...claro.keys()]);
  const fontes = [
    ...arquivos("src", [".css", ".ts", ".tsx"]),
    ...arquivos("public/garcom-pwa", [".css", ".js", ".html"]).filter((f) => !f.endsWith("qrcode-generator.js")),
  ];
  // Definições locais: custom properties declaradas em CSS, em style={{ "--x": … }} ou via setProperty.
  const locais = new Set();
  for (const arquivo of fontes) {
    if (arquivo === "src/index.css") continue; // a ponte @theme só reexporta tokens
    const texto = ler(arquivo);
    for (const m of texto.matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) locais.add(m[1]);
    for (const m of texto.matchAll(/["'`](--[a-zA-Z][\w-]*)["'`]\s*[:\],)]/g)) locais.add(m[1]);
    for (const m of texto.matchAll(/setProperty\(\s*["'`](--[a-zA-Z][\w-]*)/g)) locais.add(m[1]);
  }
  const orfas = [];
  for (const arquivo of fontes) {
    for (const m of ler(arquivo).matchAll(/var\(\s*(--[a-zA-Z][\w-]*)/g)) {
      const nome = m[1];
      if (definidos.has(nome) || locais.has(nome) || nome.startsWith("--tw-")) continue;
      orfas.push(`${arquivo}: var(${nome})`);
    }
  }
  assert.deepEqual([...new Set(orfas)], [], "tokens consumidos sem definição (a regra some em silêncio no navegador)");
});

test("primitivos de componente da identidade existem uma vez e ficam fora do cardápio", () => {
  const passe = semComentarios(ler("src/styles/passe.css"));
  for (const classe of [".placa", ".placa__numero", ".regua", ".ficha", ".rotulo", ".simbolo", ".assinatura", ".logo-placa", ".qr-quiet-zone"]) {
    assert.ok(new RegExp(`\\${classe}(?![\\w-])[^{}]*\\{`).test(passe), `${classe} precisa estar em src/styles/passe.css`);
  }
  // Tudo em passe.css vive dentro da guarda que exclui o cardápio do cliente.
  const fora = passe
    .replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "")
    .replace(/:where\(html:not\(\[data-identidade="cardapio"\]\)\)\s*\{[\s\S]*\n\}/, "")
    .trim();
  assert.equal(fora, "", "regra de passe.css fora de :where(html:not([data-identidade=\"cardapio\"]))");

  // A plaquinha lê só os tokens dela: troca de tema sem regra extra.
  assert.match(passe, /\.placa \{[^}]*background: var\(--plaque\);[^}]*color: var\(--plaque-text\)/);
  // A linha de passe não é uma classe: cada superfície desenha a sua. O que
  // elas têm em comum são os tokens — trajeto e estação ativa — em dois pares:
  // --route/--route-active sobre papel, --ink-band-line (ou --sidebar-line) e
  // --ink-band-signal sobre faixa de tinta.
  for (const arquivo of [
    "src/components/OpsShell.css",
    "src/screens/login-fields.css",
    "src/screens/landing/styles/main.css",
    "public/institucional.css",
    "public/garcom-pwa/styles.css",
  ]) {
    const css = semComentarios(ler(arquivo));
    assert.match(css, /var\(--(route|ink-band-line|sidebar-line)\)/, `${arquivo}: trajeto em repouso vem de token`);
    assert.match(css, /var\(--(route-active|ink-band-signal)\)/, `${arquivo}: estação ativa vem de token`);
  }
  assert.doesNotMatch(passe, /\.rota(__|\b)/, "primitivo .rota removido: não tinha nenhum uso");
  // O logotipo oficial (tinta sobre claro) mora numa placa de papel nos dois temas.
  assert.match(passe, /\.logo-placa \{[^}]*background: var\(--qr-paper\)/);
});

test("PWA consome a mesma fonte de tokens e leva a fonte no shell offline", () => {
  const css = ler("public/garcom-pwa/styles.css");
  assert.match(css, /^@import "\.\/design-tokens\.css";/);
  assert.doesNotMatch(semComentarios(css), /@font-face/, "a fonte é declarada uma vez só, no arquivo de tokens");
  assert.doesNotMatch(semComentarios(css), /^\s*--[\w-]+\s*:/m, "o PWA não redefine tokens: sem paleta paralela");
  assert.match(ler("public/garcom-pwa/index.html"), /<link rel="stylesheet" href="\.\/design-tokens\.css">/);
  const sw = ler("public/garcom-pwa/sw.js");
  for (const recurso of ["./design-tokens.css", "./styles.css", "./theme-init.js", "./fonts/archivo-latin-wdth-normal.woff2"]) {
    assert.ok(sw.includes(`'${recurso}'`), `${recurso} precisa estar no shell offline`);
  }
});

test("a identidade anterior não volta por descuido", () => {
  assert.doesNotMatch(tokens, /--stage-|--prim-|--glass-|--elev-/, "tokens do palco/brasa/vidro saíram do arquivo de tokens");
  const antigos = /var\(--(?:stage|prim|glass|elev)-|Fraunces|Plus Jakarta|JetBrains Mono|Comanda de Chapa/;
  const fontes = [
    ...arquivos("src", [".css", ".ts", ".tsx"]),
    ...arquivos("public/garcom-pwa", [".css", ".js", ".html", ".webmanifest"]).filter((f) => !f.endsWith("qrcode-generator.js")),
    "index.html",
  ];
  for (const arquivo of fontes) {
    const achado = antigos.exec(ler(arquivo));
    assert.equal(achado, null, `${arquivo} ainda cita a identidade anterior: "${achado?.[0]}"`);
  }
  // As fontes antigas existem só para o cardápio do cliente, na pasta dele.
  const pastaAntiga = "src/screens/cardapio-identidade/fontes";
  assert.ok(fs.existsSync(path.join(RAIZ, pastaAntiga)), "as fontes do cardápio continuam guardadas com ele");
  assert.deepEqual(
    fs.readdirSync(path.join(RAIZ, "public/garcom-pwa/fonts")).filter((f) => f.endsWith(".woff2")),
    ["archivo-latin-wdth-normal.woff2"],
    "a pasta de fontes compartilhada só tem a família da identidade",
  );
});

test("exceção declarada: o cardápio do cliente segue isolado e documentado", () => {
  const docs = ler("docs/DESIGN_SYSTEM.md");
  assert.match(docs, /Passe/);
  assert.match(docs, /#\/mesa\/:token/);
  assert.match(docs, /exceção/i);
  assert.match(docs, /test:cardapio-intacto/);
  assert.match(tokens, /O cardápio do cliente \(#\/mesa\/:token\) NÃO usa estes valores/);
  // A exceção tem dono: um arquivo gerado e uma suíte que a protege.
  assert.ok(fs.existsSync(path.join(RAIZ, "src/screens/cardapio-identidade/identidade-cardapio.css")));
  assert.ok(fs.existsSync(path.join(RAIZ, "tests/cardapio-isolamento.test.cjs")));
  assert.ok(fs.existsSync(path.join(RAIZ, "scripts/verificar-cardapio-intacto.mjs")));
});
