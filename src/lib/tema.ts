/**
 * Preferência de tema clara/escura compartilhada entre o SPA e o PWA do garçom.
 * Espelha os tokens semânticos de `public/garcom-pwa/design-tokens.css`
 * (Território A — "Comanda de Chapa", compartilhada entre SPA e PWA).
 */

export type Tema = "claro" | "escuro";

const CHAVE_TEMA = "qradmin-tema";
export const EVENTO_TEMA = "qradmin-tema";

export const TOKENS_TEMA: Record<Tema, Record<string, string>> = {
  claro: {
    "--surface": "#f1eadc",
    "--surface-raised": "#faf5e9",
    "--surface-sunken": "#e7dcc8",
    "--surface-sidebar": "#17120e",
    "--text": "#2b2118",
    "--text-muted": "#5b4a39",
    "--brand": "#bf3b11",
    "--brand-contrast": "#faf5e9",
    "--brand-ink": "#b5360d",
    "--accent": "#76521f",
    "--line": "#cbbda6",
    "--line-strong": "#a89578",
  },
  escuro: {
    "--surface": "#17120e",
    "--surface-raised": "#241c15",
    "--surface-sunken": "#100c09",
    "--surface-sidebar": "#100c09",
    "--text": "#f4ecdc",
    "--text-muted": "#c8b79f",
    "--brand": "#ff7d52",
    "--brand-contrast": "#17120e",
    "--brand-ink": "#ffb59a",
    "--accent": "#b88d54",
    "--line": "#49392c",
    "--line-strong": "#69513d",
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
  fg: "#17120e",
  bg: "#faf5e9",
} as const;

export function alternarTema(): Tema {
  return aplicarTema(temaAtual() === "claro" ? "escuro" : "claro");
}
