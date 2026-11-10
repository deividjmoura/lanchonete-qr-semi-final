#!/usr/bin/env node
/**
 * Gera `src/screens/cardapio-identidade/identidade-cardapio.css`.
 *
 * O cardápio do cliente (#/mesa/:token) ficou FORA do rebranding "Passe": ele
 * precisa continuar exatamente como estava. Só que a tela herdava tokens,
 * fontes e regras globais do produto — os mesmos que o rebranding troca.
 *
 * Em vez de copiar valores à mão, este script lê os dois arquivos como eram no
 * commit de referência (a `main` antes do rebranding) e reescreve, de forma
 * mecânica, só o ESCOPO de cada regra:
 *
 *   1. `public/garcom-pwa/design-tokens.css` (todos os tokens e @font-face)
 *      :root …                       → html[data-identidade="cardapio"]×2 …
 *      Especificidade (0,2,1) no claro e (0,3,1) no escuro: sempre acima dos
 *      tokens novos, que ficam em (0,1,0) e (0,2,0).
 *
 *   2. `src/index.css` (regras globais sem camada, depois do `@layer base`)
 *      .seletor                      → :where(html[data-identidade="cardapio"]) .seletor
 *      `:where()` tem especificidade zero, então cada regra mantém exatamente
 *      a força que tinha na cascata original.
 *
 *   3. Os demais CSS do SPA (landing, login, casco, painel…). O SPA entrega um
 *      único arquivo de estilo, então toda regra sem escopo desses arquivos
 *      também vestia o cardápio: `button { color: inherit }`, `a { … }`,
 *      `.brand-mark { … }`, o anel de foco… O gerador percorre cada arquivo e
 *      guarda, com o mesmo `:where()`, toda regra cujo seletor PODE casar com
 *      a árvore do cardápio (critério conservador: todas as classes do seletor
 *      existem no código que desenha a tela). O resto é ignorado.
 *
 * O atributo `data-identidade="cardapio"` é colocado no <html> antes do
 * primeiro paint (public/garcom-pwa/theme-init.js) e mantido em toda troca de
 * rota (src/lib/identidade.ts).
 *
 * Nada aqui é verificado por inspeção: a prova é `npm run test:cardapio-intacto`,
 * que compara pixels e estilo computado contra o build da `main`.
 *
 * Uso: node scripts/gerar-identidade-cardapio.mjs [--base <ref>] [--conferir]
 *   --conferir  não grava: falha se o arquivo versionado diferir do gerado.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { fontesDoCardapio, podeCasarNoCardapio, seletoresDe, vocabularioDe } from "./lib/arvore-do-cardapio.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valorDe = (nome, padrao) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : padrao);

/* Último commit da `main` antes do rebranding: é a referência do cardápio. */
export const COMMIT_DE_REFERENCIA = "bc9727ef336888fa39634f5eeb579af940c2c387";
const BASE = valorDe("--base", COMMIT_DE_REFERENCIA);
const CONFERIR = args.includes("--conferir");
const DESTINO = path.join(raiz, "src/screens/cardapio-identidade/identidade-cardapio.css");

const ESCOPO_TOKENS = 'html[data-identidade="cardapio"][data-identidade="cardapio"]';
const ESCOPO_REGRAS = ':where(html[data-identidade="cardapio"])';

const daBase = (arquivo) =>
  execFileSync("git", ["show", `${BASE}:${arquivo}`], { cwd: raiz, encoding: "utf8", maxBuffer: 1 << 26 });
const enxuto = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
const falhar = (mensagem) => {
  console.error(`gerar-identidade-cardapio: ${mensagem}`);
  process.exit(1);
};

/* ---------------------------------------------------------------- tokens -- */
function escopoDoToken(seletor) {
  const partes = postcss.list.comma(seletor).map((s) => s.trim());
  const saida = new Set();
  for (const parte of partes) {
    if (parte === ":root") saida.add(ESCOPO_TOKENS);
    else if (parte === '[data-theme="claro"]') saida.add(ESCOPO_TOKENS);
    else if (parte === ':root:not([data-theme="claro"])') saida.add(`${ESCOPO_TOKENS}:not([data-theme="claro"])`);
    else if (parte === ':root[data-theme="escuro"]' || parte === '[data-theme="escuro"]') saida.add(`${ESCOPO_TOKENS}[data-theme="escuro"]`);
    else if (parte === ".dark") saida.add(`${ESCOPO_TOKENS}.dark`);
    else falhar(`seletor de token não previsto: "${parte}"`);
  }
  return [...saida].join(",\n");
}

const tokensAntigos = postcss.parse(daBase("public/garcom-pwa/design-tokens.css"));
tokensAntigos.walkComments((c) => c.remove());
const blocos = [];
const universais = [];
for (const no of tokensAntigos.nodes) {
  if (no.type === "atrule" && no.name === "font-face") {
    const copia = no.clone();
    copia.walkDecls("src", (d) => {
      if (!d.value.includes('url("./fonts/')) falhar(`@font-face sem ./fonts/: ${d.value}`);
      d.value = d.value.replace('url("./fonts/', 'url("./fontes/');
    });
    blocos.push(copia);
  } else if (no.type === "rule" && no.selector.trim().startsWith(":where(")) {
    universais.push(no);
  } else if (no.type === "rule") {
    const copia = no.clone();
    copia.selector = escopoDoToken(no.selector);
    blocos.push(copia);
  } else if (no.type === "atrule" && no.name === "media") {
    const copia = no.clone();
    copia.each((filho) => {
      if (filho.type !== "rule") falhar(`conteúdo não previsto em @media dos tokens: ${filho.type}`);
      filho.selector = escopoDoToken(filho.selector);
    });
    blocos.push(copia);
  } else {
    falhar(`nó não previsto nos tokens: ${no.type} ${no.name || ""}`);
  }
}

/* As regras universais de interação (:where(...)) valem para o produto inteiro
   e continuam, idênticas, no arquivo de tokens novo. Conferido aqui. */
const tokensNovos = enxuto(fs.readFileSync(path.join(raiz, "public/garcom-pwa/design-tokens.css"), "utf8"));
for (const regra of universais) {
  if (!tokensNovos.includes(enxuto(regra.toString()))) {
    falhar(`a regra universal "${regra.selector.split("\n")[0]}…" precisa continuar idêntica em design-tokens.css`);
  }
}

/* ------------------------------------------------------- regras globais -- */
const indexAntigo = postcss.parse(daBase("src/index.css"));
const posicaoDaBase = indexAntigo.nodes.findIndex((no) => no.type === "atrule" && no.name === "layer" && no.params.trim() === "base");
if (posicaoDaBase < 0) falhar("não encontrei `@layer base` no index.css de referência");

/* Só do casco administrativo, do painel e das filas: nunca existem na árvore
   do cardápio (conferido em Mesa.tsx, ui.tsx, Toasts.tsx e ConfirmacaoGlobal.tsx). */
const SO_DO_PAINEL = /^(\.ops-|\.stage-|\.week-bar-value|(article)?\[data-glass-card\])/;
const KEYFRAMES_SO_DO_PAINEL = new Set(["glass-card-in"]);

/* O prefixo usa o combinador de descendente, então um seletor cujo primeiro
   termo casava com o próprio <html> (`*`, `[data-theme="escuro"] …`, `.dark …`)
   ganha também a variante colada na raiz. `:where()` não soma especificidade:
   as duas variantes pesam exatamente o que o seletor original pesava. */
const PODE_SER_A_RAIZ = /^(\*|\[data-theme[^\]]*\]|\.dark(?![\w-])|\.tema-(?:claro|escuro)(?![\w-]))/;

const SO_NA_RAIZ = ':where([data-identidade="cardapio"])';

function escoparSeletor(seletor) {
  const saida = [];
  for (const parte of postcss.list.comma(seletor).map((s) => s.trim())) {
    /* `html …` e `:root …` já são a raiz: o atributo entra colado, dentro de
       `:where()`, e o resto do seletor segue como estava. */
    const raizExplicita = /^(html|:root)(?![\w-])/.exec(parte);
    if (raizExplicita) {
      saida.push(`${raizExplicita[0]}${SO_NA_RAIZ}${parte.slice(raizExplicita[0].length)}`);
      continue;
    }
    /* `::selection`, `:focus-visible`… sem tipo equivalem a `*::selection`. */
    const universalImplicito = /^:(?!where\(|is\(|not\(|has\()/.test(parte);
    const naRaiz = universalImplicito ? ["*"] : PODE_SER_A_RAIZ.exec(parte);
    if (naRaiz) saida.push(`${ESCOPO_REGRAS}${naRaiz[0] === "*" && !universalImplicito ? parte.slice(1) : parte}`);
    saida.push(`${ESCOPO_REGRAS} ${parte}`);
  }
  return saida.join(",\n");
}

function converter(no) {
  if (no.type === "comment") return null;
  if (no.type === "rule") {
    const partes = postcss.list.comma(no.selector).map((s) => s.trim());
    if (partes.every((p) => SO_DO_PAINEL.test(p))) return null;
    const copia = no.clone();
    copia.walkComments((c) => c.remove());
    copia.selector = escoparSeletor(no.selector);
    return copia;
  }
  if (no.type === "atrule" && no.name === "keyframes") {
    if (KEYFRAMES_SO_DO_PAINEL.has(no.params.trim())) return null;
    const copia = no.clone();
    copia.walkComments((c) => c.remove());
    return copia;
  }
  if (no.type === "atrule" && no.name === "media") {
    const copia = no.clone({ nodes: [] });
    for (const filho of no.nodes) {
      const convertido = converter(filho);
      if (convertido) copia.append(convertido);
    }
    return copia.nodes.length ? copia : null;
  }
  falhar(`nó global não previsto: ${no.type} ${no.name || ""} ${no.params || ""}`);
  return null;
}

const regras = [];
for (const no of indexAntigo.nodes.slice(posicaoDaBase + 1)) {
  const convertido = converter(no);
  if (convertido) regras.push(convertido);
}

/* O `@layer base` e a ponte `@theme` do Tailwind continuam valendo para o
   produto inteiro: só leem tokens, e os tokens do cardápio são os antigos.
   Conferido aqui: nenhuma linha antiga pode ter sumido do index.css atual. */
const indexNovo = postcss.parse(fs.readFileSync(path.join(raiz, "src/index.css"), "utf8"));
const camada = (arvore) => arvore.nodes.find((no) => no.type === "atrule" && no.name === "layer" && no.params.trim() === "base");
if (enxuto(camada(indexAntigo).toString()) !== enxuto(camada(indexNovo)?.toString() || "")) {
  falhar("o `@layer base` de src/index.css precisa continuar idêntico ao de referência (ele também veste o cardápio)");
}
const ponte = (arvore) => {
  const mapa = new Map();
  arvore.walkAtRules("theme", (tema) => tema.walkDecls((d) => mapa.set(d.prop, d.value.trim())));
  return mapa;
};
const ponteNova = ponte(indexNovo);
for (const [prop, valor] of ponte(indexAntigo)) {
  if (ponteNova.get(prop) !== valor) falhar(`@theme: "${prop}: ${valor}" precisa continuar em src/index.css (encontrado: ${ponteNova.get(prop) ?? "ausente"})`);
}
for (const linha of ['@custom-variant dark (&:where([data-theme="escuro"], [data-theme="escuro"] *));']) {
  if (!fs.readFileSync(path.join(raiz, "src/index.css"), "utf8").includes(linha)) falhar(`src/index.css precisa manter: ${linha}`);
}

/* ------------------------------------- regras que vazavam de outros CSS -- */
/* Ordem em que os arquivos entravam no CSS único do build de referência
   (conferida no dist da base). `index.css` já foi tratado acima e
   `mesa-praia.css` continua sendo importado, intacto, pelo próprio cardápio. */
const OUTROS_CSS = [
  "src/screens/login-fields.css",
  "src/components/AuthModal.css",
  "src/screens/landing/styles/main.css",
  "src/screens/dashboard.css",
  "src/screens/operacional.css",
  "src/components/OpsShell.css",
  "src/screens/admin/admin-responsive.css",
];
const cssDaBase = execFileSync("git", ["ls-tree", "-r", "--name-only", BASE, "src"], { cwd: raiz, encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".css") && f !== "src/index.css" && f !== "src/screens/mesa-praia.css");
for (const f of cssDaBase) if (!OUTROS_CSS.includes(f)) falhar(`CSS do SPA não previsto no commit de referência: ${f}`);

/* O que pode existir na tela do cardápio, lido do commit de referência. */
const arquivosDaBase = new Set(
  execFileSync("git", ["ls-tree", "-r", "--name-only", BASE], { cwd: raiz, encoding: "utf8", maxBuffer: 1 << 26 }).split("\n"),
);
const fontes = fontesDoCardapio((arquivo) => (arquivosDaBase.has(arquivo) ? daBase(arquivo) : null));
const vocabulario = vocabularioDe([...fontes.values()]);
if (vocabulario.desconhecidos.size) {
  falhar(
    `texto montado em tempo de execução não classificado: ${[...vocabulario.desconhecidos].join(", ")}. ` +
      "Confira se é nome de classe e registre em PREFIXOS_QUE_NAO_SAO_CLASSE (scripts/lib/arvore-do-cardapio.mjs).",
  );
}

const vazadas = [];
function converterVazada(no) {
  if (no.type === "comment") return null;
  if (no.type === "rule") {
    const partes = postcss.list.comma(no.selector).map((s) => s.trim()).filter((p) => podeCasarNoCardapio(p, vocabulario));
    if (!partes.length) return null;
    const copia = no.clone();
    copia.walkComments((c) => c.remove());
    copia.selector = escoparSeletor(partes.join(", "));
    return copia;
  }
  if (no.type === "atrule" && (no.name === "media" || no.name === "supports")) {
    const copia = no.clone({ nodes: [] });
    for (const filho of no.nodes) {
      const convertido = converterVazada(filho);
      if (convertido) copia.append(convertido);
    }
    return copia.nodes.length ? copia : null;
  }
  /* @font-face e @keyframes só importam se uma regra vazada os usar; conferido abaixo. */
  if (no.type === "atrule" && (no.name === "font-face" || no.name === "keyframes")) return null;
  falhar(`nó não previsto em CSS do SPA: ${no.type} ${no.name || ""} ${no.params || ""}`);
  return null;
}
for (const arquivo of OUTROS_CSS) {
  const css = daBase(arquivo);
  let arvore = null;
  try {
    arvore = postcss.parse(css);
  } catch {
    const suspeitos = seletoresDe(css)
      .map((achado) => achado.seletor)
      .filter((parte) => podeCasarNoCardapio(parte, vocabulario));
    if (suspeitos.length) falhar(`${arquivo} (CSS malformado na referência) tem seletor que pode casar com o cardápio: ${suspeitos.slice(0, 5).join(" | ")}`);
    continue;
  }
  const doArquivo = [];
  for (const no of arvore.nodes) {
    const convertido = converterVazada(no);
    if (convertido) doArquivo.push(convertido);
  }
  for (const regra of doArquivo) {
    regra.walkDecls((d) => {
      /* url() relativa e @keyframes dependeriam do arquivo de origem. */
      if (/url\(/.test(d.value)) falhar(`${arquivo}: regra vazada com url() não prevista (${d.prop})`);
      if (/^animation(-name)?$/.test(d.prop) && d.value.trim() !== "none") falhar(`${arquivo}: regra vazada com animação não prevista (${d.value})`);
    });
  }
  if (doArquivo.length) vazadas.push({ arquivo, regras: doArquivo });
}

/* ---------------------------------------------------------------- saída -- */
const cabecalho = `/* ==========================================================================
   IDENTIDADE DO CARDÁPIO DO CLIENTE (#/mesa/:token) — ARQUIVO GERADO
   --------------------------------------------------------------------------
   NÃO EDITE À MÃO. Gerado por scripts/gerar-identidade-cardapio.mjs a partir
   de public/garcom-pwa/design-tokens.css, src/index.css e dos demais CSS do
   SPA no commit
   ${BASE}
   (a \`main\` antes do rebranding "Passe").

   O cardápio ficou fora do rebranding e precisa continuar idêntico. Este
   arquivo guarda, sem alterar um valor, os tokens, as fontes e as regras
   globais que a tela herdava — presos ao atributo data-identidade="cardapio",
   que só existe no <html> enquanto a rota é #/mesa/….

   Prova: npm run test:cardapio-intacto
   ========================================================================== */
`;
const corpo = [
  "/* ---- 1. fontes e tokens (de design-tokens.css) ---- */",
  ...blocos.map((no) => no.toString()),
  "/* ---- 2. regras globais (de src/index.css, depois do @layer base) ---- */",
  ...regras.map((no) => no.toString()),
  "/* ---- 3. regras sem escopo que vazavam de outros CSS do SPA ---- */",
  ...vazadas.flatMap(({ arquivo, regras: doArquivo }) => [`/* de ${arquivo} */`, ...doArquivo.map((no) => no.toString())]),
].join("\n\n");
const gerado = `${cabecalho}\n${corpo}\n`;

if (CONFERIR) {
  const atual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, "utf8") : "";
  if (atual !== gerado) falhar(`${path.relative(raiz, DESTINO)} difere do que o gerador produz para ${BASE}`);
  console.log(`identidade do cardápio confere com ${BASE.slice(0, 7)} (${blocos.length} blocos de tokens, ${regras.length} regras globais, ${vazadas.reduce((n, v) => n + v.regras.length, 0)} regras vazadas)`);
} else {
  fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
  fs.writeFileSync(DESTINO, gerado);
  console.log(`gravado ${path.relative(raiz, DESTINO)}: ${blocos.length} blocos de tokens, ${regras.length} regras globais, ${vazadas.reduce((n, v) => n + v.regras.length, 0)} regras vazadas, ${gerado.length} bytes`);
}
