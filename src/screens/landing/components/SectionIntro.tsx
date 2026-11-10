import type { ReactNode } from "react";

/* Cabeçalho de seção: a estação (um nó da linha de passe e o rótulo), o
   título na voz da identidade e, opcionalmente, um parágrafo de apoio. */
export function SectionIntro({
  eyebrow,
  title,
  children,
  className = "",
  id,
}: {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={`section-intro ${className}`}>
      {eyebrow && (
        <p className="estacao">
          <span className="estacao__no" aria-hidden="true" />
          {eyebrow}
        </p>
      )}
      <h2 id={id}>{title}</h2>
      {children && <div className="section-intro__body">{children}</div>}
    </div>
  );
}
