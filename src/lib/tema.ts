/* Cores em index.css; o DOM mantém a escolha mesmo sem localStorage. */
export type Tema = "claro" | "escuro";

const KEY = "qradmin-tema";
export const EVENTO_TEMA = "qradmin-tema";

export function temaAtual(): Tema {
  if (typeof window === "undefined") return "claro";
  const aplicado = document.documentElement.dataset.theme;
  if (aplicado === "escuro" || aplicado === "claro") return aplicado;
  try {
    const t = localStorage.getItem(KEY);
    if (t === "escuro" || t === "claro") return t;
  } catch {
    /* Armazenamento pode estar bloqueado; o tema continua funcionando. */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "escuro" : "claro";
}

export function aplicarTema(t: Tema) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* modo anônimo etc. */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "escuro" ? "#0b1524" : "#f8fafc");
  window.dispatchEvent(new CustomEvent<Tema>(EVENTO_TEMA, { detail: t }));
}

export function alternarTema() {
  aplicarTema(temaAtual() === "claro" ? "escuro" : "claro");
}
