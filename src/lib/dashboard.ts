/** Contrato do dashboard interativo. O endpoint legado permanece independente. */
export type PeriodoDashboard = "hoje" | "semana" | "mes";
export type TotaisDashboard = {
  faturamento: number;
  vendasBrutas: number;
  servicoTotal: number;
  descontosTotal: number;
  contasFechadas: number;
  ticketMedio: number;
  pedidosTotal: number;
  pedidosPorStatus: Record<string, number>;
};
export type DiaDashboard = {
  dia: string;
  label: string;
  faturamento: number;
  vendasBrutas: number;
  servicoTotal: number;
  descontosTotal: number;
  contas: number;
  pedidos: number;
  pedidosPorStatus: Record<string, number>;
};
export type DashboardGeral = {
  periodo: {
    chave: PeriodoDashboard;
    from: string;
    to: string;
    dias: number;
    timezone: string;
    anterior: { from: string; to: string; dias: number };
  };
  resumo: TotaisDashboard;
  anterior: TotaisDashboard;
  porDia: DiaDashboard[];
  historico: DiaDashboard[];
  pagamentos: {
    formas: { forma: string; valor: number }[];
    semDetalhamento: number;
    excedente: number;
  };
  topProdutos: { id: number; nome: string; setor: string; quantidade: number }[];
  atual: {
    sessoesAbertas: number;
    consumoEntregue: number;
    pagamentosParciais: number;
    saldoPendente: number;
    mesas: { total: number; ocupadas: number; livres: number };
    garconsAtivos: number;
    itens: { aguardando: number; preparo: number; prontos: number; retirados: number };
  };
  entrega: { mediaMinutos: number | null; unidades: number };
  entregaAnterior: { mediaMinutos: number | null; unidades: number };
  atualizadoEm: string;
};
