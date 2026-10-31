/* Fila de produção por item (cozinha e bar).

   A unidade da tela é o ITEM, não a comanda: um pedido com três itens pode ter
   um em produção e dois na fila, e cada seção mostra só os itens que estão
   naquela etapa. Item concluído sai da fila do setor e aparece na hora para o
   garçom — a entrega continua sendo dele. */

import type { ItemPedido, Pedido } from "./types";

export type EtapaFilaId = "em_producao" | "na_fila";

/** Estado do item na etapa: o que a seção mostra e o que o botão grava. */
export type StatusEtapa = "recebido" | "em_producao";

export type CardComanda = {
  pedido: Pedido;
  /** Somente os itens do pedido que estão nesta etapa. */
  itens: ItemPedido[];
};

export const ETAPAS_FILA: {
  id: EtapaFilaId;
  status: StatusEtapa;
  titulo: string;
  descricao: string;
  /** Próximo status ao avançar um item desta seção. */
  proximo: "em_producao" | "concluido";
  acaoItem: string;
  acaoComanda: string;
}[] = [
  {
    id: "em_producao",
    status: "em_producao",
    titulo: "Em produção",
    descricao: "Itens já iniciados neste setor",
    proximo: "concluido",
    acaoItem: "Liberar este item",
    acaoComanda: "Liberar",
  },
  {
    id: "na_fila",
    status: "recebido",
    titulo: "Na fila",
    descricao: "Itens aguardando início",
    proximo: "em_producao",
    acaoItem: "Iniciar este item",
    acaoComanda: "Iniciar",
  },
];

/** 15 minutos na fila: mesmo alerta operacional já usado na tela. */
export const LIMITE_ATRASO_MINUTOS = 15;

export function itensDaEtapa(pedidos: Pedido[], etapa: EtapaFilaId): ItemPedido[] {
  const alvo = etapa === "na_fila" ? "recebido" : "em_producao";
  const itens: ItemPedido[] = [];
  for (const pedido of pedidos) {
    for (const item of pedido.itens || []) {
      if (item.status === alvo) itens.push(item);
    }
  }
  return itens;
}

/**
 * Um cartão por comanda, contendo apenas os itens daquela etapa.
 * Ordena pela criação do pedido (mais antigo primeiro) e mantém a ordem dos
 * itens como vieram do servidor.
 */
export function cardsDaEtapa(pedidos: Pedido[], etapa: EtapaFilaId): CardComanda[] {
  const alvo = etapa === "na_fila" ? "recebido" : "em_producao";
  return pedidos
    .slice()
    .sort((a, b) => a.criadoEm - b.criadoEm || a.id - b.id)
    .map((pedido) => ({
      pedido,
      itens: (pedido.itens || []).filter((item) => item.status === alvo),
    }))
    .filter((card) => card.itens.length > 0);
}

export function contarItensPorEtapa(pedidos: Pedido[]): Record<EtapaFilaId, number> {
  return {
    em_producao: itensDaEtapa(pedidos, "em_producao").length,
    na_fila: itensDaEtapa(pedidos, "na_fila").length,
  };
}

/** Item na fila há mais de 15 min (usa o horário de criação da comanda). */
export function pedidoAtrasado(pedido: Pedido, agora: number): boolean {
  return agora - pedido.criadoEm > LIMITE_ATRASO_MINUTOS * 60000;
}

/** Rótulo da ação de comanda inteira, sempre nomeando a etapa afetada. */
export function rotuloAcaoComanda(etapa: EtapaFilaId, quantidade: number): string {
  const acao = etapa === "na_fila" ? "Iniciar" : "Liberar";
  const alvo = quantidade === 1 ? "o item" : `os ${quantidade} itens`;
  return `${acao} ${alvo} desta etapa`;
}
