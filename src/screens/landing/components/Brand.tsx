import type { MouseEvent } from "react";
import { Assinatura } from "../../../components/ui";
import { useRolagemInterna } from "../useRolagemInterna";

/* Assinatura do QR Admin no cabeçalho: o símbolo reduzido ("olho do passe") e
   o nome. O logotipo ilustrado oficial só aparece onde tem tamanho para ser
   lido (rodapé e tela de acesso), sempre sobre uma placa de papel. */
export function Brand({ className = "" }: { className?: string }) {
  const rolar = useRolagemInterna();
  const aoClicar = (event: MouseEvent<HTMLAnchorElement>) => {
    /* O logotipo aponta para a raiz do produto. Quando já estamos na raiz,
       evitamos o recarregamento e apenas voltamos ao topo. */
    if (window.location.pathname === "/" && !window.location.hash) {
      rolar(event, "#inicio");
    }
  };

  return (
    <a className={`brand ${className}`} href="/" aria-label="QR Admin — página inicial" onClick={aoClicar}>
      <Assinatura size={26} />
    </a>
  );
}

/* Logotipo ilustrado oficial sobre a placa de papel (legível nos dois temas). */
export function LogoOficial({ size = 64 }: { size?: number }) {
  return (
    <span className="logo-placa">
      <img src="/logo/qradmin-mark.png" alt="" aria-hidden="true" width={size} height={size} draggable={false} />
    </span>
  );
}
