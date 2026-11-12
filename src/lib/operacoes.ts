/**
 * Contador de operações assíncronas em andamento (#301).
 *
 * A proteção do aviso de atualização não pode olhar só para campos de
 * formulário: um pedido já enviado ao servidor, um fechamento de conta em
 * curso ou um pagamento em processamento não têm campo sujo visível, e mesmo
 * assim recarregar a página ali perde o retorno da operação (o operador não
 * sabe se gravou). Este módulo mantém um contador global alimentado pelo
 * cliente HTTP (`apiSend`) e por telas que fazem trabalho assíncrono próprio,
 * e permite que o aviso saiba, na hora de confirmar, se existe algo em voo.
 *
 * Não guarda dado sensível: só quantidade e rótulos curtos opcionais.
 */

type Ouvinte = (quantidade: number) => void;

let emAndamento = 0;
const ouvintes = new Set<Ouvinte>();

function notificar() {
  for (const ouvinte of ouvintes) {
    try {
      ouvinte(emAndamento);
    } catch {
      /* Um ouvinte com problema não pode quebrar a operação de negócio. */
    }
  }
}

/**
 * Marca o início de uma operação. Devolve a função que a encerra — idempotente,
 * para poder ser chamada em `finally` e também num timeout.
 */
export function iniciarOperacao(): () => void {
  emAndamento += 1;
  notificar();
  let encerrada = false;
  return () => {
    if (encerrada) return;
    encerrada = true;
    emAndamento = Math.max(0, emAndamento - 1);
    notificar();
  };
}

/** Quantidade de operações assíncronas em andamento neste momento. */
export function operacoesEmAndamento(): number {
  return emAndamento;
}

/** Observa mudanças no contador. Devolve o cancelamento da inscrição. */
export function observarOperacoes(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Só para testes: zera o contador sem chamar os encerradores pendentes. */
export function reiniciarOperacoesParaTeste() {
  emAndamento = 0;
  notificar();
}
