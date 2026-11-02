import { useCallback, useEffect, useState, type ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { Modal } from "./ui";
import { registrarConfirmador, type ConfirmacaoOpcoes } from "../lib/confirmacao";

type Pedido = { opcoes: ConfirmacaoOpcoes; resolver: (confirmado: boolean) => void };

export function ConfirmacaoGlobal({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const abrir = useCallback((opcoes: ConfirmacaoOpcoes) => new Promise<boolean>((resolver) => {
    setPedido({ opcoes, resolver });
  }), []);
  useEffect(() => registrarConfirmador(abrir), [abrir]);

  const fechar = (confirmado: boolean) => {
    pedido?.resolver(confirmado);
    setPedido(null);
  };
  const opcoes = pedido?.opcoes;
  return <>
    {children}
    <Modal open={Boolean(pedido)} onClose={() => fechar(false)} closeOnBackdrop={false} alert labelledBy="confirmacao-titulo" describedBy="confirmacao-mensagem">
      <div className="p-6 sm:p-7">
        <div className="flex items-start gap-3 pr-10">
          <span className={`mt-0.5 grid size-11 shrink-0 place-items-center rounded-full border ${opcoes?.perigo ? "border-status-danger-border bg-status-danger-surface text-status-danger-ink" : "border-brand-border bg-brand-surface text-brand-ink"}`}>
            <WarningCircle size={23} weight="duotone" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-text-muted">Confirmação necessária</p>
            <h2 id="confirmacao-titulo" className="mt-1 font-display text-xl font-bold text-text">{opcoes?.titulo || "Confirmar ação"}</h2>
          </div>
        </div>
        <p id="confirmacao-mensagem" className="mt-5 whitespace-pre-line text-sm leading-relaxed text-text-muted">{opcoes?.mensagem}</p>
        <div className="mt-7 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => fechar(false)}
            className="min-h-11 rounded-sm border border-line bg-surface-sunken px-4 text-sm font-semibold text-text hover:bg-surface-hover">
            {opcoes?.cancelar || "Cancelar"}
          </button>
          <button type="button" onClick={() => fechar(true)}
            className={`min-h-11 rounded-sm border px-4 text-sm font-semibold ${opcoes?.perigo ? "border-status-danger bg-status-danger text-status-danger-contrast hover:opacity-90" : "border-brand bg-brand text-brand-contrast hover:bg-brand-hover"}`}>
            {opcoes?.confirmar || "Confirmar"}
          </button>
        </div>
      </div>
    </Modal>
  </>;
}
