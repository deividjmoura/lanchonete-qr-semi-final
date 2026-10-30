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
/* Espelho fiel de src/index.css — mesmos tokens, mesmos valores.
   Se a paleta mudar, mude nos dois lugares (o CSS é a fonte de verdade). */
const VARS_CLARO: Record<string, string> = {
  "--qr-page": "#faf6f0",
  "--qr-text": "#241c16",
  "--qr-white": "#ffffff",
  "--qr-slate-50": "#fbf7f2",
  "--qr-slate-100": "#f4efe7",
  "--qr-slate-200": "#e8dfd1",
  "--qr-slate-300": "#d7c9b7",
  "--qr-slate-400": "#a9998a",
  "--qr-slate-500": "#7c6b5c",
  "--qr-slate-600": "#5f5145",
  "--qr-slate-700": "#463b32",
  "--qr-slate-800": "#302821",
  "--qr-navy-500": "#8a4b2f",
  "--qr-navy-700": "#5c3a26",
  "--qr-navy-800": "#3a2a20",
  "--qr-navy-900": "#241c16",
  "--qr-brand-50": "#fff4ed",
  "--qr-brand-100": "#ffe5d5",
  "--qr-brand-200": "#fec9ac",
  "--qr-brand-300": "#fba57c",
  "--qr-brand-400": "#f47f50",
  "--qr-brand-500": "#e85d2f",
  "--qr-brand-600": "#d1481f",
  "--qr-brand-700": "#a93a1a",
  "--qr-teal-400": "#4cb98a",
  "--qr-teal-500": "#2c9b6d",
  "--qr-teal-600": "#1f8059",
  "--qr-teal-700": "#17694a",
  "--qr-amber-500": "#f0a020",
  "--qr-amber-600": "#c9820f",
  "--qr-amber-700": "#8f5a08",
  "--qr-rose-400": "#f87c6e",
  "--qr-rose-500": "#e2453a",
  "--qr-rose-600": "#c3302a",
  "--qr-rose-700": "#9d2521",
  "--qr-violet-500": "#8a5cd6",
  "--qr-violet-600": "#7145c2",
  "--qr-violet-700": "#5c37a0",
  "--qr-violet-900": "#3a2369",
  "--qr-sky-500": "#2b7fbf",
  "--qr-sky-600": "#1f6ba5",
  "--qr-sky-700": "#17527f",
  "--qr-grad-from": "#241c16",
  "--qr-stroke": "rgba(36, 28, 22, 0.22)",
  "--qr-fill-brand-from": "#d94e22",
  "--qr-fill-brand-to": "#b03c17",
  "--qr-fill-success-from": "#1f8059",
  "--qr-fill-success-to": "#17694a",
  "--qr-fill-danger-from": "#c3302a",
  "--qr-fill-danger-to": "#9d2521",
  "--qr-card-shadow": "0 1px 2px rgba(58, 37, 20, 0.05), 0 14px 34px -20px rgba(58, 37, 20, 0.2)",
  "--qr-card-shadow-deep": "0 2px 6px rgba(58, 37, 20, 0.06), 0 26px 54px -26px rgba(58, 37, 20, 0.26)",
  "--qr-scrollbar": "#d7c9b7",
  "--qr-halo": "rgba(232, 93, 47, 0.065)",
  "--qr-halo-2": "rgba(44, 155, 109, 0.05)",
};

const VARS_ESCURO: Record<string, string> = {
  "--qr-page": "#14100d",
  "--qr-text": "#f7eee3",
  "--qr-white": "#221c16",
  "--qr-slate-50": "#14100d",
  "--qr-slate-100": "#2a221c",
  "--qr-slate-200": "#3a2f27",
  "--qr-slate-300": "#4e4034",
  "--qr-slate-400": "#8c7a68",
  "--qr-slate-500": "#b6a28e",
  "--qr-slate-600": "#cbb8a4",
  "--qr-slate-700": "#ddcbb7",
  "--qr-slate-800": "#f4e7d6",
  "--qr-navy-500": "#d9a17a",
  "--qr-navy-700": "#f0c9a8",
  "--qr-navy-800": "#f6dcc2",
  "--qr-navy-900": "#fcf1e4",
  "--qr-brand-50": "#3a2117",
  "--qr-brand-100": "#4a2a1c",
  "--qr-brand-200": "#5e3423",
  "--qr-brand-300": "#8a4a2c",
  "--qr-brand-400": "#ff8b57",
  "--qr-brand-500": "#ff7a45",
  "--qr-brand-600": "#ff9364",
  "--qr-brand-700": "#ffb08a",
  "--qr-teal-400": "#4ed3a0",
  "--qr-teal-500": "#35c08c",
  "--qr-teal-600": "#5fe0ae",
  "--qr-teal-700": "#8cebc5",
  "--qr-amber-500": "#f7b84b",
  "--qr-amber-600": "#ffc96b",
  "--qr-amber-700": "#ffd89a",
  "--qr-rose-400": "#ff8a80",
  "--qr-rose-500": "#ff6b5e",
  "--qr-rose-600": "#ff8f84",
  "--qr-rose-700": "#ffb4ac",
  "--qr-violet-500": "#a78bfa",
  "--qr-violet-600": "#b49cfc",
  "--qr-violet-700": "#cbb8ff",
  "--qr-violet-900": "#e4dbff",
  "--qr-sky-500": "#5cb0e8",
  "--qr-sky-600": "#7cc4f2",
  "--qr-sky-700": "#a5d8fa",
  "--qr-grad-from": "#f7eee3",
  "--qr-stroke": "rgba(247, 238, 227, 0.3)",
  "--qr-fill-brand-from": "#c9451c",
  "--qr-fill-brand-to": "#a03616",
  "--qr-fill-success-from": "#17724f",
  "--qr-fill-success-to": "#115c40",
  "--qr-fill-danger-from": "#b02b26",
  "--qr-fill-danger-to": "#8d211e",
  "--qr-card-shadow": "0 1px 2px rgba(0, 0, 0, 0.5), 0 18px 40px -22px rgba(0, 0, 0, 0.7)",
  "--qr-card-shadow-deep": "0 2px 6px rgba(0, 0, 0, 0.55), 0 30px 60px -26px rgba(0, 0, 0, 0.75)",
  "--qr-scrollbar": "#4e4034",
  "--qr-halo": "rgba(255, 122, 69, 0.085)",
  "--qr-halo-2": "rgba(53, 192, 140, 0.055)",
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
  if (meta) meta.setAttribute("content", t === "escuro" ? "#14100d" : "#faf6f0");
  window.dispatchEvent(new CustomEvent<Tema>(EVENTO_TEMA, { detail: t }));
}

export function alternarTema() {
  aplicarTema(temaAtual() === "claro" ? "escuro" : "claro");
}
