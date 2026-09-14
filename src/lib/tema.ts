/* Tema claro/escuro — persistido em localStorage e aplicado via
   document.documentElement.dataset.theme.

   As variáveis do tema escuro são injetadas também via <style> inline em
   runtime (além do index.css) para funcionar mesmo se algum proxy/CDN
   transformar o CSS estático. */

export type Tema = "claro" | "escuro";

const KEY = "qradmin-tema";
export const EVENTO_TEMA = "qradmin-tema";

/* Bloco dark idêntico ao de src/index.css — injetado em runtime. */
const DARK_CSS = `
[data-theme="dark"]{
  --qr-white:#12233a;
  --qr-slate-50:#0b1524;
  --qr-slate-100:#1a2c44;
  --qr-slate-200:#274059;
  --qr-slate-300:#3c5876;
  --qr-slate-400:#8fa7c0;
  --qr-slate-500:#a3b7cd;
  --qr-slate-600:#bccadb;
  --qr-slate-700:#cfdbe8;
  --qr-slate-800:#e2ebf4;
  --qr-navy-500:#6d94bd;
  --qr-navy-700:#a5c8ec;
  --qr-navy-800:#c3daf3;
  --qr-navy-900:#eaf2fb;
  --qr-brand-50:#0d2f31;
  --qr-brand-400:#2dd4bf;
  --qr-brand-500:#00c4b4;
  --qr-brand-600:#22d3c5;
  --qr-brand-700:#67e8dc;
  --qr-teal-400:#2dd4bf;
  --qr-teal-500:#14b8a6;
  --qr-teal-600:#2dd4bf;
  --qr-teal-700:#5eead4;
  --qr-amber-500:#f59e0b;
  --qr-amber-700:#fcd34d;
  --qr-rose-400:#fb7185;
  --qr-rose-500:#f43f5e;
  --qr-rose-600:#fb7185;
  --qr-rose-700:#fda4af;
  --qr-violet-500:#8b5cf6;
  --qr-violet-700:#c4b5fd;
  --qr-sky-500:#0ea5e9;
  --qr-sky-700:#7dd3fc;
  --qr-page:#0b1524;
  --qr-text:#eaf2fb;
  --qr-grad-from:#eaf2fb;
  --qr-stroke:rgba(234,242,251,.32);
  --qr-card-shadow:0 1px 2px rgba(0,0,0,.4),0 12px 30px -18px rgba(0,0,0,.6);
  --qr-card-shadow-deep:0 2px 4px rgba(0,0,0,.45),0 20px 48px -20px rgba(0,0,0,.65);
  --qr-scrollbar:#3c5876;
  color-scheme:dark;
}
[data-theme="dark"] .text-white{color:#fff}
[data-theme="dark"] .border-white{border-color:#fff}
`;

function garantirStyleDark() {
  if (document.getElementById("qr-theme-dark")) return;
  const st = document.createElement("style");
  st.id = "qr-theme-dark";
  st.textContent = DARK_CSS;
  document.head.appendChild(st);
}

export function temaAtual(): Tema {
  if (typeof window === "undefined") return "claro";
  try {
    const t = localStorage.getItem(KEY);
    if (t === "escuro" || t === "claro") return t;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "escuro" : "claro";
  } catch {
    return "claro";
  }
}

export function aplicarTema(t: Tema) {
  garantirStyleDark();
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
