import type { MouseEvent } from "react";
import { useRolagemInterna } from "../useRolagemInterna";

/* Marca oficial do QR Admin: o símbolo (mesa com QR e comanda) vem de
   /logo/qradmin-mark.png, o mesmo asset usado pelo login e pelas telas
   administrativas. O desenho do símbolo provisório da apresentação foi
   substituído apenas nesse ponto — o resto da composição é o aprovado. */
export function BrandMark({
  size = 38,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`brand-mark ${className}`} style={{ ["--mark-size" as string]: `${size}px` }}>
      {/* Símbolo oficial do produto (mesmo arquivo do login e do PWA). */}
      <img src="/logo/qradmin-mark.png" alt="" aria-hidden="true" draggable={false} />
    </span>
  );
}

export function Brand({
  inverted = false,
  compact = false,
  className = "",
}: {
  inverted?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const rolar = useRolagemInterna();
  const aoClicar = (event: MouseEvent<HTMLAnchorElement>) => {
    /* O logotipo aponta para a raiz do produto. Quando já estamos na raiz,
       evitamos o recarregamento e apenas voltamos ao topo. */
    if (window.location.pathname === "/" && !window.location.hash) {
      rolar(event, "#inicio");
    }
  };

  return (
    <a
      className={`brand${inverted ? " brand--inverted" : ""}${compact ? " brand--compact" : ""} ${className}`}
      href="/"
      aria-label="QRAdmin — página inicial"
      onClick={aoClicar}
    >
      <BrandMark size={compact ? 31 : 36} />
      <span className="brand-wordmark">
        <strong>QR</strong>
        <span>Admin</span>
      </span>
    </a>
  );
}
