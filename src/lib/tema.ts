/**
 * Preferência de tema clara/escura compartilhada entre o SPA e o PWA do garçom.
 * Espelha os tokens semânticos de `public/garcom-pwa/design-tokens.css`
 * (direção "A COMANDA / Taproom Brasa", zero branco/preto puros).
 */

export type Tema = "claro" | "escuro";

const CHAVE_TEMA = "qradmin-tema";
export const EVENTO_TEMA = "qradmin-tema";

export const TOKENS_TEMA: Record<Tema, Record<string, string>> = {
  claro: {
    "--surface": "#f0e6d2",
    "--surface-raised": "#f7f0e2",
    "--surface-sunken": "#e5d8be",
    "--surface-sidebar": "#17120e",
    "--text": "#17120e",
    "--text-muted": "#594b3e",
    "--brand": "#bf3b11",
    "--brand-contrast": "#f7f0e2",
    "--brand-ink": "#b5360d",
    "--accent": "#c99a2e",
    "--line": "#cfc0a3",
    "--line-strong": "#b09d7b",
  },
  escuro: {
    "--surface": "#141813",
    "--surface-raised": "#1c211b",
    "--surface-sunken": "#0f120e",
    "--surface-sidebar": "#100c09",
    "--text": "#ede5d5",
    "--text-muted": "#b0a795",
    "--brand": "#e8501f",
    "--brand-contrast": "#17120e",
    "--brand-ink": "#ff7d52",
    "--accent": "#c99a2e",
    "--line": "#2e362c",
    "--line-strong": "#434e40",
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
