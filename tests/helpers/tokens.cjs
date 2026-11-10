"use strict";

/**
 * Leitura dos tokens de design para os testes.
 *
 * `public/garcom-pwa/design-tokens.css` é a fonte única da identidade "Passe".
 * Este módulo lê o arquivo com postcss e devolve, para cada tema, o valor de
 * cada token com as referências `var(--x)` já resolvidas — é o que permite
 * conferir contraste e comparar com as cores repetidas fora do CSS (a meta
 * theme-color, o manifest do PWA, as cores do QR Code).
 */

const fs = require("node:fs");
const path = require("node:path");
const postcss = require("postcss");

const RAIZ = path.join(__dirname, "..", "..");
const ARQUIVO_DE_TOKENS = "public/garcom-pwa/design-tokens.css";
const CONGELADO = "src/screens/cardapio-identidade/identidade-cardapio.css";

const ler = (arquivo) => fs.readFileSync(path.join(RAIZ, arquivo), "utf8");

function declaracoes(regra) {
  const mapa = new Map();
  regra.each((no) => {
    if (no.type === "decl") mapa.set(no.prop, no.value.trim());
  });
  return mapa;
}

/** Blocos do arquivo de tokens, na ordem em que aparecem. */
function blocos(css = ler(ARQUIVO_DE_TOKENS)) {
  const raiz = postcss.parse(css);
  const saida = { primitivos: new Map(), claro: new Map(), escuroSistema: new Map(), escuroEscolhido: new Map() };
  raiz.each((no) => {
    if (no.type === "rule") {
      const seletor = no.selector.replace(/\s+/g, " ").trim();
      if (seletor === ":root") for (const [k, v] of declaracoes(no)) saida.primitivos.set(k, v);
      else if (seletor === ':root, [data-theme="claro"]') saida.claro = declaracoes(no);
      else if (seletor === ':root[data-theme="escuro"], [data-theme="escuro"], .dark') saida.escuroEscolhido = declaracoes(no);
    } else if (no.type === "atrule" && no.name === "media" && /prefers-color-scheme:\s*dark/.test(no.params)) {
      no.each((filho) => {
        if (filho.type === "rule") saida.escuroSistema = declaracoes(filho);
      });
    }
  });
  return saida;
}

/** Resolve `var(--x)` (inclusive dentro de outras funções) até sobrar só valor. */
function resolver(valor, mapa, profundidade = 0) {
  if (profundidade > 12) throw new Error(`referência circular ao resolver ${valor}`);
  return String(valor).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (tudo, nome, reserva) => {
    if (mapa.has(nome)) return resolver(mapa.get(nome), mapa, profundidade + 1);
    if (reserva !== undefined) return resolver(reserva.trim(), mapa, profundidade + 1);
    return tudo;
  });
}

/** Token → valor final, por tema ("claro" | "escuro"). */
function temaResolvido(tema, css) {
  const b = blocos(css);
  const mapa = new Map([...b.primitivos, ...b.claro, ...(tema === "escuro" ? b.escuroEscolhido : [])]);
  const saida = {};
  for (const [nome, valor] of mapa) saida[nome] = resolver(valor, mapa);
  return saida;
}

/** `--surface` da identidade congelada do cardápio, por tema. */
function superficieDoCardapio() {
  const raiz = postcss.parse(ler(CONGELADO));
  const primitivos = new Map();
  const porTema = { claro: null, escuro: null };
  raiz.walkRules((regra) => {
    if (regra.parent.type === "atrule" && regra.parent.name !== "media") return;
    const d = declaracoes(regra);
    for (const [k, v] of d) if (k.startsWith("--prim-")) primitivos.set(k, v);
    if (!d.has("--surface")) return;
    const escuro = /\[data-theme="escuro"\]|\.dark|:not\(\[data-theme="claro"\]\)/.test(regra.selector);
    porTema[escuro ? "escuro" : "claro"] = d.get("--surface");
  });
  return {
    claro: resolver(porTema.claro, primitivos),
    escuro: resolver(porTema.escuro, primitivos),
  };
}

function luminancia(hex) {
  const canais = hex
    .replace("#", "")
    .match(/../g)
    .map((c) => parseInt(c, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return canais[0] * 0.2126 + canais[1] * 0.7152 + canais[2] * 0.0722;
}

function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Mistura `color-mix(in srgb, A p%, B)` de dois hexadecimais. */
function misturar(valor) {
  const m = /^color-mix\(in srgb,\s*(#[0-9a-f]{6})\s+(\d+(?:\.\d+)?)%,\s*(#[0-9a-f]{6})\)$/i.exec(String(valor).trim());
  if (!m) return valor;
  const p = Number(m[2]) / 100;
  const canal = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const misto = [0, 1, 2].map((i) => Math.round(canal(m[1], i) * p + canal(m[3], i) * (1 - p)));
  return "#" + misto.map((c) => c.toString(16).padStart(2, "0")).join("");
}

module.exports = { ARQUIVO_DE_TOKENS, CONGELADO, RAIZ, ler, blocos, resolver, temaResolvido, superficieDoCardapio, contraste, misturar };
