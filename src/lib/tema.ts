/* Tema claro/escuro — valores canônicos em PT: "claro" | "escuro".
   Compat: aceita (e normaliza) os legados "light"/"dark" de builds anteriores
   que ainda possam estar em cache no navegador do usuário.
   Três camadas de defesa para a troca funcionar sempre:
   1. atributo data-theme (canônico) + classe .dark (CSS legado);
   2. fallback inline das variáveis críticas (CSS antigo em cache);
   3. CSS aceita "escuro" E "dark" (src/index.css). */
export type Tema = "claro" | "escuro";

const KEY = "qradmin-tema";
export const EVENTO_TEMA = "qradmin-tema";

/** Variáveis críticas aplicadas inline — sobrevivem a CSS antigo/cacheado no deploy. */
const VARS_CLARO: Record<string, string> = {
  "--qr-page": "#f5f7f4",
  "--qr-text": "#21382b",
  "--qr-white": "#ffffff",
  "--qr-slate-50": "#f7f8f7",
  "--qr-slate-100": "#f0f2f0",
  "--qr-slate-200": "#dfe5e1",
  "--qr-slate-300": "#c3cfc8",
  "--qr-slate-400": "#6f8078",
  "--qr-slate-500": "#596b62",
  "--qr-slate-600": "#43564b",
  "--qr-slate-700": "#304439",
  "--qr-slate-800": "#24392e",
  "--qr-navy-500": "#587464",
  "--qr-navy-700": "#344f3f",
  "--qr-navy-800": "#293e32",
  "--qr-navy-900": "#21382b",
  "--qr-brand-50": "#fff0eb",
  "--qr-brand-400": "#e77860",
  "--qr-brand-500": "#c74732",
  "--qr-brand-600": "#b83b29",
  "--qr-brand-700": "#a43424",
  "--qr-teal-400": "#4b9870",
  "--qr-teal-500": "#32815a",
  "--qr-teal-600": "#26704f",
  "--qr-teal-700": "#205e42",
  "--qr-grad-from": "#21382b",
  "--qr-stroke": "rgba(33,56,43,.24)",
  "--qr-card-shadow": "0 2px 4px rgba(24,46,33,.025), 0 8px 24px -16px rgba(24,46,33,.12)",
  "--qr-card-shadow-deep": "0 4px 6px rgba(24,46,33,.025), 0 16px 40px -24px rgba(24,46,33,.18)",
  "--qr-scrollbar": "#c3cfc8",
};

const VARS_ESCURO: Record<string, string> = {
  "--qr-page": "#141d19",
  "--qr-text": "#eef4ef",
  "--qr-white": "#1c2623",
  "--qr-slate-50": "#141d19",
  "--qr-slate-100": "#26332c",
  "--qr-slate-200": "#37483d",
  "--qr-slate-300": "#506458",
  "--qr-slate-400": "#a0b4a7",
  "--qr-slate-500": "#b0c3b7",
  "--qr-slate-600": "#c3d2c8",
  "--qr-slate-700": "#d7e2da",
  "--qr-slate-800": "#e5ede7",
  "--qr-navy-500": "#99b5a3",
  "--qr-navy-700": "#bed5c6",
  "--qr-navy-800": "#d6e5da",
  "--qr-navy-900": "#eef4ef",
  "--qr-brand-50": "#3b2822",
  "--qr-brand-400": "#f49a82",
  "--qr-brand-500": "#f1846e",
  "--qr-brand-600": "#f79a87",
  "--qr-brand-700": "#ffb5a2",
  "--qr-teal-400": "#88cba4",
  "--qr-teal-500": "#72bc92",
  "--qr-teal-600": "#88cba4",
  "--qr-teal-700": "#a3dfbc",
  "--qr-grad-from": "#eef4ef",
  "--qr-stroke": "rgba(238,244,239,.28)",
  "--qr-card-shadow": "0 2px 8px rgba(0,0,0,.1)",
  "--qr-card-shadow-deep": "0 8px 28px -16px rgba(0,0,0,.4)",
  "--qr-scrollbar": "#506458",
};

function aplicarVarsInline(t: Tema) {
  const root = document.documentElement;
  const vars = t === "escuro" ? VARS_ESCURO : VARS_CLARO;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}

/** Normaliza qualquer valor já visto em produção para o par canônico PT. */
function normalizar(valor: string | null | undefined): Tema | null {
  if (valor === "escuro" || valor === "dark") return "escuro";
  if (valor === "claro" || valor === "light") return "claro";
  return null;
}

export function temaAtual(): Tema {
  if (typeof window === "undefined") return "claro";
  const doAtributo = normalizar(document.documentElement.getAttribute("data-theme"));
  if (doAtributo) return doAtributo;
  try {
    const salvo = normalizar(localStorage.getItem(KEY));
    if (salvo) return salvo;
  } catch {
    /* Armazenamento pode estar bloqueado; o tema continua funcionando. */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "escuro" : "claro";
}

export function aplicarTema(t: Tema) {
  const root = document.documentElement;
  // 1) Atributo canônico — o CSS novo casa com [data-theme="escuro"/"claro"].
  root.setAttribute("data-theme", t);
  // 2) Classe .dark — compatível com CSS legado que case por classe.
  root.classList.toggle("dark", t === "escuro");
  root.classList.toggle("tema-escuro", t === "escuro");
  root.classList.toggle("tema-claro", t === "claro");
  // 3) Fallback inline — garante troca visual mesmo se o CSS do deploy estiver em cache antigo.
  aplicarVarsInline(t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* modo anônimo etc. */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "escuro" ? "#141d19" : "#f5f7f4");
  window.dispatchEvent(new CustomEvent<Tema>(EVENTO_TEMA, { detail: t }));
}

export function alternarTema() {
  aplicarTema(temaAtual() === "claro" ? "escuro" : "claro");
}
