/**
 * Preferência de tema clara/escura compartilhada entre o SPA e o PWA do garçom.
 *
 * Os valores de cor NÃO moram aqui: a fonte única é
 * `public/garcom-pwa/design-tokens.css` (identidade "Passe"). Este módulo só
 * liga e desliga o tema no <html>; a cor da barra do navegador é lida do token
 * `--surface` já resolvido, de modo que ela acompanha a identidade em uso
 * (inclusive a do cardápio do cliente, que conserva a anterior).
 */

export type Tema = "claro" | "escuro";

const CHAVE_TEMA = "qradmin-tema";
export const EVENTO_TEMA = "qradmin-tema";

function normalizar(valor: string | null | undefined): Tema | null {
  if (valor === "escuro" || valor === "dark") return "escuro";
  if (valor === "claro" || valor === "light") return "claro";
  return null;
}

export function temaAtual(): Tema {
  if (typeof window === "undefined") return "claro";
  const aplicado =
    typeof document !== "undefined"
      ? normalizar(document.documentElement.getAttribute("data-theme"))
      : null;
  if (aplicado) return aplicado;
  try {
    const salvo = normalizar(localStorage.getItem(CHAVE_TEMA));
    if (salvo) return salvo;
  } catch {
    /* modo privado ou armazenamento bloqueado */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "escuro" : "claro";
}

export function aplicarTema(tema: Tema): Tema {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.setAttribute("data-theme", tema);
    root.classList.toggle("dark", tema === "escuro");
    root.classList.toggle("tema-escuro", tema === "escuro");
    root.classList.toggle("tema-claro", tema === "claro");
    const meta = document.querySelector('meta[name="theme-color"]');
    const fundo =
      typeof getComputedStyle === "function" ? getComputedStyle(root).getPropertyValue("--surface").trim() : "";
    if (meta && fundo) meta.setAttribute("content", fundo);
  }
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    /* modo privado ou armazenamento bloqueado */
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent<Tema>(EVENTO_TEMA, { detail: tema }));
  }
  return tema;
}

/* QR Code é sempre tinta escura sobre papel claro, nos dois temas: é o que a
   câmera do cliente lê. A biblioteca recebe a cor como atributo SVG e o
   download gera PNG, então aqui precisa ser literal — os dois valores são os
   tokens `--qr-ink` e `--qr-paper` (conferido em tests/design-system.test.cjs). */
export const QR_SVG_COLORS = {
  fg: "#081726",
  bg: "#fffdf8",
} as const;

export function alternarTema(): Tema {
  return aplicarTema(temaAtual() === "claro" ? "escuro" : "claro");
}
