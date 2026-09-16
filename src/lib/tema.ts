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
  "--qr-page": "#e9eef3",
  "--qr-text": "#0a2540",
  "--qr-white": "#f7f9fb",
  "--qr-slate-50": "#eef2f6",
  "--qr-slate-100": "#e7edf2",
  "--qr-slate-200": "#d5dee7",
  "--qr-slate-300": "#c1ced9",
  "--qr-slate-400": "#8798aa",
  "--qr-slate-500": "#596b7e",
  "--qr-slate-600": "#435467",
  "--qr-slate-700": "#2f4154",
  "--qr-slate-800": "#203245",
  "--qr-navy-500": "#2e5a87",
  "--qr-navy-700": "#1a3a5c",
  "--qr-navy-800": "#0f2c4a",
  "--qr-navy-900": "#0a2540",
  "--qr-brand-50": "#ecfaf8",
  "--qr-brand-400": "#2dd4bf",
  "--qr-brand-500": "#00b3a5",
  "--qr-brand-600": "#00958a",
  "--qr-brand-700": "#08766e",
  "--qr-teal-400": "#2dd4bf",
  "--qr-teal-500": "#14b8a6",
  "--qr-teal-600": "#0d9488",
  "--qr-teal-700": "#0f766e",
  "--qr-grad-from": "#0a2540",
  "--qr-stroke": "rgba(10, 37, 64, 0.28)",
  "--qr-card-shadow": "0 1px 2px rgba(10, 37, 64, 0.04), 0 10px 28px -18px rgba(10, 37, 64, 0.18)",
  "--qr-card-shadow-deep": "0 2px 4px rgba(10, 37, 64, 0.05), 0 18px 44px -20px rgba(10, 37, 64, 0.22)",
  "--qr-scrollbar": "#c1ced9",
};

const VARS_ESCURO: Record<string, string> = {
  "--qr-page": "#0b1524",
  "--qr-text": "#eaf2fb",
  "--qr-white": "#12233a",
  "--qr-slate-50": "#0b1524",
  "--qr-slate-100": "#1a2c44",
  "--qr-slate-200": "#274059",
  "--qr-slate-300": "#3c5876",
  "--qr-slate-400": "#8fa7c0",
  "--qr-slate-500": "#a3b7cd",
  "--qr-slate-600": "#bccadb",
  "--qr-slate-700": "#cfdbe8",
  "--qr-slate-800": "#e2ebf4",
  "--qr-navy-500": "#6d94bd",
  "--qr-navy-700": "#a5c8ec",
  "--qr-navy-800": "#c3daf3",
  "--qr-navy-900": "#eaf2fb",
  "--qr-brand-50": "#0d2f31",
  "--qr-brand-400": "#2dd4bf",
  "--qr-brand-500": "#00c4b4",
  "--qr-brand-600": "#22d3c5",
  "--qr-brand-700": "#67e8dc",
  "--qr-teal-400": "#2dd4bf",
  "--qr-teal-500": "#14b8a6",
  "--qr-teal-600": "#2dd4bf",
  "--qr-teal-700": "#5eead4",
  "--qr-grad-from": "#eaf2fb",
  "--qr-stroke": "rgba(234, 242, 251, 0.32)",
  "--qr-card-shadow": "0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 30px -18px rgba(0, 0, 0, 0.6)",
  "--qr-card-shadow-deep": "0 2px 4px rgba(0, 0, 0, 0.45), 0 20px 48px -20px rgba(0, 0, 0, 0.65)",
  "--qr-scrollbar": "#3c5876",
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
  if (meta) meta.setAttribute("content", t === "escuro" ? "#0b1524" : "#e9eef3");
  window.dispatchEvent(new CustomEvent<Tema>(EVENTO_TEMA, { detail: t }));
}

export function alternarTema() {
  aplicarTema(temaAtual() === "claro" ? "escuro" : "claro");
}
