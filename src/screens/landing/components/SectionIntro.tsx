import type { ReactNode } from "react";

export function SectionIntro({
  eyebrow,
  title,
  children,
  className = "",
  light = false,
  id,
}: {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
  light?: boolean;
  id?: string;
}) {
  return (
    <div className={`section-intro${light ? " section-intro--light" : ""} ${className}`}>
      {eyebrow && (
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {eyebrow}
        </p>
      )}
      <h2 id={id}>{title}</h2>
      {children && <div className="section-intro__body">{children}</div>}
    </div>
  );
}

export function SectionIndex({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <p className={`section-index${light ? " section-index--light" : ""}`}>{children}</p>;
}
