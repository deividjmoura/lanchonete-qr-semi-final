import { useEffect, useState, type ReactNode } from "react";
import { Btn } from "./ui";

/** Limita renderização de listas já carregadas, sem alterar totais/exportação. */
export function useLimiteLocal<T>(itens: T[], tamanho = 10, reiniciar?: unknown) {
  const [limite, setLimite] = useState(tamanho);
  useEffect(() => setLimite(tamanho), [reiniciar, tamanho]);
  return {
    itens: itens.slice(0, limite),
    temMais: limite < itens.length,
    expandida: limite > tamanho && itens.length > tamanho,
    carregarMais: () => setLimite((n) => n + tamanho),
    recolher: () => setLimite(tamanho),
  };
}

type Limite<T> = ReturnType<typeof useLimiteLocal<T>>;
export function ListaLimitada<T>({ itens, tamanho = 10, children }: {
  itens: T[];
  tamanho?: number;
  children: (pagina: Limite<T>) => ReactNode;
}) {
  const pagina = useLimiteLocal(itens, tamanho);
  return <>{children(pagina)}</>;
}

export function BotaoCarregarMais({ onClick, disabled = false, carregando = false }: {
  onClick: () => void;
  disabled?: boolean;
  carregando?: boolean;
}) {
  return (
    <Btn size="sm" variant="secondary" disabled={disabled || carregando} onClick={onClick}>
      {carregando ? "Carregando…" : "Carregar mais"}
    </Btn>
  );
}

/** Controles reutilizados tanto em páginas do servidor quanto em listas locais. */
export function ControlesPaginacao({ temMais, expandida, carregarMais, recolher, disabled = false, carregando = false, className = "pt-4" }: {
  temMais: boolean;
  expandida: boolean;
  carregarMais: () => void;
  recolher: () => void;
  disabled?: boolean;
  carregando?: boolean;
  className?: string;
}) {
  if (!temMais && !expandida) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {temMais && <BotaoCarregarMais onClick={carregarMais} disabled={disabled} carregando={carregando} />}
      {expandida && <Btn size="sm" variant="outline" disabled={disabled || carregando} onClick={recolher}>Mostrar menos</Btn>}
    </div>
  );
}
