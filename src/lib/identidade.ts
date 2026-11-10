import { createContext, useContext } from "react";

/**
 * Identidade visual que veste o documento.
 *
 * O produto inteiro usa a identidade "Passe" (public/garcom-pwa/design-tokens.css).
 * A única exceção é o cardápio do cliente (#/mesa/:token): ele ficou fora do
 * rebranding e conserva a identidade anterior, guardada em
 * src/screens/cardapio-identidade/. O CSS escolhe entre as duas pelo atributo
 * `data-identidade="cardapio"` no <html>.
 *
 * O atributo nasce em public/garcom-pwa/theme-init.js (antes do primeiro
 * paint) e é mantido aqui a cada troca de rota. Os componentes React recebem a
 * mesma informação por contexto (`IdentidadeContexto`, fornecido em App.tsx).
 */

export const ATRIBUTO_IDENTIDADE = "data-identidade";

export type Identidade = "passe" | "cardapio";

/** Identidade da árvore React. `App.tsx` informa "cardapio" na rota #/mesa/:token. */
export const IdentidadeContexto = createContext<Identidade>("passe");

const comGancho = (nome: string): string | undefined => nome;
const semGancho = (): string | undefined => undefined;

/**
 * Classes-gancho que a identidade Passe põe nos componentes compartilhados de
 * src/components/ui.tsx (`qr-icon-button`, `qr-badge`, `qr-modal`…) para o
 * src/styles/passe.css redesenhá-los.
 *
 * Dentro do cardápio do cliente a função devolvida responde `undefined`: a
 * marcação dele sai idêntica, atributo por atributo, à de antes do rebranding.
 * `scripts/verificar-cardapio-intacto.mjs` compara exatamente isso.
 */
export function useGancho(): (nome: string) => string | undefined {
  return useContext(IdentidadeContexto) === "cardapio" ? semGancho : comGancho;
}

const ICONES = {
  cardapio: { aba: "/logo/favicon.png", toque: "/logo/favicon.png" },
  passe: { aba: "/logo/simbolo-96.png", toque: "/logo/simbolo-180.png" },
} as const;

/** Mesma leitura do roteador (src/router.tsx): a primeira parte do hash é "mesa". */
export function rotaEhCardapio(hash: string): boolean {
  const caminho = (hash.replace(/^#/, "") || "/").split("?")[0];
  return caminho.split("/").filter(Boolean)[0] === "mesa";
}

/** Ajusta o <html> à rota atual. Devolve `true` quando a identidade mudou. */
export function sincronizarIdentidade(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  const root = document.documentElement;
  const cardapio = rotaEhCardapio(window.location.hash);
  const estava = root.getAttribute(ATRIBUTO_IDENTIDADE) === "cardapio";
  if (cardapio) root.setAttribute(ATRIBUTO_IDENTIDADE, "cardapio");
  else root.removeAttribute(ATRIBUTO_IDENTIDADE);
  const icones = cardapio ? ICONES.cardapio : ICONES.passe;
  document.querySelector('link[rel="icon"]')?.setAttribute("href", icones.aba);
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute("href", icones.toque);
  return cardapio !== estava;
}
