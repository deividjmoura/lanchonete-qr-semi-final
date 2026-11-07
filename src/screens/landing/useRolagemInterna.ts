import { useCallback, type MouseEvent } from "react";

/* A landing vive na rota "/" do SPA, que usa roteador de hash. Um link
   "#como-funciona" puro seria interpretado pelo roteador como uma rota nova.
   Por isso os links internos mantêm o href semântico (funcionam sem JS) e
   rolam a página por JavaScript, sem mexer no hash. */
export function useRolagemInterna() {
  return useCallback((event: MouseEvent<HTMLAnchorElement>, seletor: string) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const alvo = document.querySelector(seletor);
    if (!alvo) return;
    event.preventDefault();
    const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    alvo.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" });
    if (seletor !== "#conteudo") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (alvo instanceof HTMLElement && (seletor === "#conteudo" || seletor === "#inicio")) {
      alvo.setAttribute("tabindex", "-1");
      alvo.focus({ preventScroll: true });
    }
  }, []);
}
