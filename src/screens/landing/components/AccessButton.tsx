import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { Icon } from "./Icon";

/* CTA de acesso do sistema: abre o modal de autenticação real do QR Admin,
   dentro da própria aplicação. Nenhuma rota, sessão ou validação nova é
   criada aqui. */
export function AccessButton({
  children = "Acessar o sistema",
  className = "",
  onClick,
  showIcon = true,
  ...props
}: {
  children?: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  showIcon?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      data-landing-acesso=""
      aria-haspopup="dialog"
      {...props}
    >
      <span>{children}</span>
      {showIcon && <Icon name="arrow-up-right" size={17} />}
    </button>
  );
}
