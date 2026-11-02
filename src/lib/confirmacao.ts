export type ConfirmacaoOpcoes = {
  titulo: string;
  mensagem: string;
  confirmar?: string;
  cancelar?: string;
  perigo?: boolean;
};

type Solicitante = (opcoes: ConfirmacaoOpcoes) => Promise<boolean>;
let solicitante: Solicitante | null = null;

export function registrarConfirmador(fn: Solicitante) {
  solicitante = fn;
  return () => {
    if (solicitante === fn) solicitante = null;
  };
}

/** Abre o modal global de confirmação. Sem o provider, a ação é cancelada por segurança. */
export function confirmarAcao(opcoes: ConfirmacaoOpcoes): Promise<boolean> {
  return solicitante ? solicitante(opcoes) : Promise.resolve(false);
}
