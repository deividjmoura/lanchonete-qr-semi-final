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
    "--surface":"#F5F5F4","--surface-raised":"#FAFAF9","--surface-sunken":"#E7E5E4","--surface-sidebar":"#E7E5E4",
    "--text":"#1C1917","--text-muted":"#57534E","--brand":"#B45309","--brand-contrast":"#FAFAF9","--brand-ink":"#FAFAF9",
    "--accent":"#0F766E","--line":"#D6D3D1","--line-strong":"#A8A29E",
    "--status-success":"#3F6212","--status-warning":"#A16207","--status-danger":"#B91C1C","--status-info":"#0F766E"
  },
  escuro: {
    "--surface":"#1C1917","--surface-raised":"#292524","--surface-sunken":"#0C0A09","--surface-sidebar":"#0C0A09",
    "--text":"#F5F5F4","--text-muted":"#A8A29E","--brand":"#D97706","--brand-contrast":"#1C1917","--brand-ink":"#F5F5F4",
    "--accent":"#14B8A6","--line":"#44403C","--line-strong":"#57534E",
    "--status-success":"#65A30D","--status-warning":"#EAB308","--status-danger":"#DC2626","--status-info":"#14B8A6"
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
