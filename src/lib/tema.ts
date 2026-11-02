/**
 * Preferência de tema clara/escura compartilhada entre o SPA e o PWA do garçom.
 * Espelha os tokens semânticos de `public/garcom-pwa/design-tokens.css`
 * (identidade global azul/violeta, compartilhada entre SPA e PWA).
 */

export type Tema = "claro" | "escuro";

const CHAVE_TEMA = "qradmin-tema";
export const EVENTO_TEMA = "qradmin-tema";

export const TOKENS_TEMA: Record<Tema, Record<string, string>> = {
  claro: {
    "--surface": "#EEF1F8",
    "--surface-raised": "#F8FAFF",
    "--surface-sunken": "#E0E5F1",
    "--surface-sidebar": "#0B101B",
    "--text": "#121829",
    "--text-muted": "#48536D",
    "--brand": "#5B3FC4",
    "--brand-contrast": "#F8FAFF",
    "--brand-ink": "#4A32A6",
    "--accent": "#0A5A63",
    "--line": "#C7CFE0",
    "--line-strong": "#A5B0C8",
  },
  escuro: {
    "--surface": "#0B101B",
    "--surface-raised": "#141B29",
    "--surface-sunken": "#080D16",
    "--surface-sidebar": "#080D16",
    "--text": "#EEF1FB",
    "--text-muted": "#A9B4CC",
    "--brand": "#8B6FFF",
    "--brand-contrast": "#0B101B",
    "--brand-ink": "#B7A5FF",
    "--accent": "#83EDEE",
    "--line": "#2A3348",
    "--line-strong": "#3B4660",
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
  fg: "#0B101B",
  bg: "#F8FAFF",
} as const;

export function alternarTema(): Tema {
  return aplicarTema(temaAtual() === "claro" ? "escuro" : "claro");
}
