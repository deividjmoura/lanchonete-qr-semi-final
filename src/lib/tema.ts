/**
 * Preferência de tema clara/escura compartilhada entre o SPA e o PWA do garçom.
 * Espelha os tokens semânticos de `public/garcom-pwa/design-tokens.css`
 * (Estação — verde mineral e acento cítrico, compartilhada entre SPA e PWA).
 */

export type Tema = "claro" | "escuro";

const CHAVE_TEMA = "qradmin-tema";
export const EVENTO_TEMA = "qradmin-tema";

export const TOKENS_TEMA: Record<Tema, Record<string, string>> = {
  claro: {
    "--surface": "#f0f4f0",
    "--surface-raised": "#fafcf9",
    "--surface-sunken": "#e4ece7",
    "--surface-sidebar": "#17312f",
    "--text": "#1d302f",
    "--text-muted": "#506763",
    "--brand": "#176d63",
    "--brand-contrast": "#fafcf9",
    "--brand-ink": "#14584f",
    "--accent": "#c4d66a",
    "--line": "#cbd8d0",
    "--line-strong": "#aebfb5",
  },
  escuro: {
    "--surface": "#142622",
    "--surface-raised": "#1d3430",
    "--surface-sunken": "#0f1e1b",
    "--surface-sidebar": "#0e1d19",
    "--text": "#ecf4ee",
    "--text-muted": "#b4c8be",
    "--brand": "#78c8b6",
    "--brand-contrast": "#12231f",
    "--brand-ink": "#bce4d8",
    "--accent": "#d7e98a",
    "--line": "#36534a",
    "--line-strong": "#58776c",
  },
};

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
    const vars = TOKENS_TEMA[tema];
    for (const [nome, valor] of Object.entries(vars)) {
      root.style.setProperty(nome, valor);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", vars["--surface"]);
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

export const QR_SVG_COLORS = {
  fg: "#1d302f",
  bg: "#fafcf9",
} as const;

export function alternarTema(): Tema {
  return aplicarTema(temaAtual() === "claro" ? "escuro" : "claro");
}
