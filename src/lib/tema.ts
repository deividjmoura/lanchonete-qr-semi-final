/**
 * Preferência de tema clara/escura compartilhada entre o SPA e o PWA do garçom.
 * Espelha os tokens semânticos de `public/garcom-pwa/design-tokens.css`
 * (identidade global "Palco Azul/Violeta", zero branco/preto puros).
 */

export type Tema = "claro" | "escuro";

const CHAVE_TEMA = "qradmin-tema";
export const EVENTO_TEMA = "qradmin-tema";

export const TOKENS_TEMA: Record<Tema, Record<string, string>> = {
  claro: {
    "--surface": "#eef1f8",
    "--surface-raised": "#f8faff",
    "--surface-sunken": "#e0e5f1",
    "--surface-sidebar": "#0b101b",
    "--text": "#121829",
    "--text-muted": "#48536d",
    "--brand": "#5b3fc4",
    "--brand-contrast": "#f8faff",
    "--brand-ink": "#4a32a6",
    "--accent": "#0a5a63",
    "--line": "#c7cfe0",
    "--line-strong": "#a5b0c8",
  },
  escuro: {
    "--surface": "#0b101b",
    "--surface-raised": "#141b29",
    "--surface-sunken": "#080d16",
    "--surface-sidebar": "#080d16",
    "--text": "#eef1fb",
    "--text-muted": "#a9b4cc",
    "--brand": "#8b6fff",
    "--brand-contrast": "#0b101b",
    "--brand-ink": "#b7a5ff",
    "--accent": "#4fd1e0",
    "--line": "#2a3348",
    "--line-strong": "#3b4660",
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
  bg: "#f7f0e2",
} as const;

export function alternarTema(): Tema {
  return aplicarTema(temaAtual() === "claro" ? "escuro" : "claro");
}
