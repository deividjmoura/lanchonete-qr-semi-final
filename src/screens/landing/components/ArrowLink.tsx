import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";

export function ArrowLink({
  href,
  children,
  className = "",
  ...props
}: { href: string; children: ReactNode; className?: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={`arrow-link ${className}`} href={href} {...props}>
      <span>{children}</span>
      <span className="arrow-link__icon">
        <Icon name="arrow-right" size={17} />
      </span>
    </a>
  );
}
