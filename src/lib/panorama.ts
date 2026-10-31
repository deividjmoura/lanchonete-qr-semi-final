/* Contrato do panorama de mesas (admin) e utilitários puros da tela.
   O backend devolve uma entrada por mesa habilitada; filtros e resumos são
   calculados aqui, sem consultar o servidor de novo a cada clique. */

export type PeriodoPanorama = "hoje" | "semana" | "mes";
export type FaixaTempoId = "recente" | "atencao" | "critica";
export type FiltroPraca = "todas" | "sem" | number;

export type FaixasTempo = { atencaoMinutos: number; criticoMinutos: number };

export type TempoMesa = {
  id: FaixaTempoId;
  minutos: number;
  atencaoMinutos: number;
  criticoMinutos: number;
};

export type Praca = { id: number; nome: string; ordem: number; mesas: number };
/** Retorno de criar/renomear praça (o uso por mesa vem em `adminPracas`). */
export type PracaSalva = Pick<Praca, "id" | "nome" | "ordem">;

export type MesaPanorama = {
  id: number;
  numero: number;
  token: string;
  status: "livre" | "ocupada";
  pracaId: number | null;
  pracaNome: string | null;
  pracaOrdem: number | null;
  sessaoId: number | null;
  abertaEm: string | null;
  tempo: TempoMesa | null;
  clienteNome: string | null;
  garcomResponsavelId: number | null;
  garcomResponsavelNome: string | null;
  consumo: number;
  pago: number;
  saldo: number;
  pedidosAtivos: number;
  pedidosRecebidos: number;
  pedidosPreparo: number;
  pedidosProntos: number;
  itensNaFila: number;
  itensProntosRetirada: number;
};

export type VendaPorMesa = { numero: number; contas: number; total: number };

export type VendasPeriodo = {
  periodo: PeriodoPanorama;
  timezone: string;
  desde: string;
  ate: string;
  porMesa: VendaPorMesa[];
};

export type EtapaFluxoId =
  | "recebimento_inicio"
  | "inicio_pronto"
  | "pronto_retirada"
  | "retirada_entrega";
export type SetorFluxoId = "cozinha" | "bar" | "garcom";

export type MedidaEtapa = {
  aplicavel: boolean;
  minutos: number | null;
  amostras: number;
  disponivel: boolean;
  aproximado: boolean;
};

export type EtapaFluxo = {
  id: EtapaFluxoId;
  rotulo: string;
  descricao: string;
  setores: SetorFluxoId[];
};

export type FluxoProducao = {
  janela: { horas: number; desde: string | null; ate: string | null };
  amostraMinima: number;
  limiteEtapaHoras: number;
  etapas: EtapaFluxo[];
  setores: Record<SetorFluxoId, { id: SetorFluxoId; rotulo: string; etapas: Record<EtapaFluxoId, MedidaEtapa> }>;
};

export type PanoramaMesas = {
  config: { quantidade: number; limite: number; faixas: FaixasTempo };
  pracas: Praca[];
  mesas: MesaPanorama[];
  vendas: VendasPeriodo;
  fluxo: FluxoProducao;
  atualizadoEm: string;
};

export type ItemMesaDetalhe = {
  id: number;
  nome: string;
  quantidade: number;
  status: string;
  setor: "cozinha" | "bar";
  prontoEm: string | null;
  retiradoEm: string | null;
  entregueEm: string | null;
};

export type PedidoMesaDetalhe = {
  id: number;
  status: string;
  criadoEm: string | null;
  editadoEm: string | null;
  clienteNome: string | null;
  garcomNome: string | null;
  itens: ItemMesaDetalhe[];
};

export type PagamentoMesaDetalhe = {
  id: number;
  valor: number;
  forma: string | null;
  criadoEm: string | null;
};

export type MesaDetalhe = MesaPanorama & {
  faixas: FaixasTempo;
  pedidos: PedidoMesaDetalhe[];
  pagamentos: PagamentoMesaDetalhe[];
  atualizadoEm: string;
};

/** Rótulos e classes por faixa. O texto sempre acompanha a cor: cor sozinha
 *  não distingue situação para quem não percebe contraste. */
export const FAIXAS_TEMPO: Record<
  FaixaTempoId,
  { rotulo: string; descricao: string; classe: string; ponto: string; tom: "sage" | "brass" | "rose" }
> = {
  recente: {
    rotulo: "Recente",
    descricao: "Atendimento em curso dentro do tempo esperado.",
    classe: "border-status-success-border bg-status-success-surface text-status-success-ink",
    ponto: "bg-status-success",
    tom: "sage",
  },
  atencao: {
    rotulo: "Atenção",
    descricao: "Mesa ocupada além do tempo usual: vale uma visita.",
    classe: "border-status-warning-border bg-status-warning-surface text-status-warning-ink",
    ponto: "bg-status-warning",
    tom: "brass",
  },
  critica: {
    rotulo: "Crítica",
    descricao: "Mesa sem giro há muito tempo: verifique atendimento e conta.",
    classe: "border-status-danger-border bg-status-danger-surface text-status-danger-ink",
    ponto: "bg-status-danger",
    tom: "rose",
  },
};

/** Faixas usadas quando o servidor ainda não devolve `config.faixas`. */
export const FAIXAS_PADRAO: FaixasTempo = { atencaoMinutos: 45, criticoMinutos: 90 };

/** HH:MM no fuso local; `—` para ausente/inválido (nunca "Invalid Date"). */
export function formatarHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (!Number.isFinite(data.getTime())) return "—";
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export const PERIODOS: { id: PeriodoPanorama; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "semana", rotulo: "Semana" },
  { id: "mes", rotulo: "Mês" },
];

export const ROTULO_PERIODO: Record<PeriodoPanorama, string> = {
  hoje: "hoje",
  semana: "nesta semana",
  mes: "neste mês",
};

/** Mesma regra do backend: recente < atenção < crítica. */
export function faixaOcupacao(
  abertaEm: string | null | undefined,
  agora: number,
  faixas: FaixasTempo,
): { id: FaixaTempoId; minutos: number } | null {
  if (!abertaEm) return null;
  const inicio = new Date(abertaEm).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(Number(agora))) return null;
  const minutos = Math.max(0, Math.floor((Number(agora) - inicio) / 60000));
  const id: FaixaTempoId =
    minutos < faixas.atencaoMinutos ? "recente" : minutos < faixas.criticoMinutos ? "atencao" : "critica";
  return { id, minutos };
}

/** "8 min", "1h05", "2h40" — compacto para caber em 70 cards. */
export function formatarDuracao(minutos: number | null | undefined): string {
  if (minutos == null || !Number.isFinite(Number(minutos))) return "—";
  const total = Math.max(0, Math.round(Number(minutos)));
  if (total < 60) return `${total} min`;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return resto ? `${horas}h${String(resto).padStart(2, "0")}` : `${horas}h`;
}

export function filtrarMesas(mesas: MesaPanorama[], filtro: FiltroPraca): MesaPanorama[] {
  if (filtro === "todas") return mesas;
  if (filtro === "sem") return mesas.filter((m) => m.pracaId == null);
  return mesas.filter((m) => Number(m.pracaId) === Number(filtro));
}

export type ResumoMesas = {
  total: number;
  ocupadas: number;
  livres: number;
  recentes: number;
  atencao: number;
  criticas: number;
  consumo: number;
  pago: number;
  saldo: number;
  pedidosAtivos: number;
  itensNaFila: number;
  itensProntosRetirada: number;
};

const arred2 = (valor: number) => Number(Number(valor || 0).toFixed(2));

/** Consumo em aberto nunca é receita: é o entregue ainda não pago. */
export function resumirMesas(mesas: MesaPanorama[]): ResumoMesas {
  const resumo: ResumoMesas = {
    total: mesas.length,
    ocupadas: 0,
    livres: 0,
    recentes: 0,
    atencao: 0,
    criticas: 0,
    consumo: 0,
    pago: 0,
    saldo: 0,
    pedidosAtivos: 0,
    itensNaFila: 0,
    itensProntosRetirada: 0,
  };
  for (const mesa of mesas) {
    if (mesa.sessaoId) resumo.ocupadas += 1;
    else resumo.livres += 1;
    if (mesa.tempo?.id === "atencao") resumo.atencao += 1;
    if (mesa.tempo?.id === "critica") resumo.criticas += 1;
    if (mesa.tempo?.id === "recente") resumo.recentes += 1;
    resumo.consumo += Number(mesa.consumo || 0);
    resumo.pago += Number(mesa.pago || 0);
    resumo.saldo += Number(mesa.saldo || 0);
    resumo.pedidosAtivos += Number(mesa.pedidosAtivos || 0);
    resumo.itensNaFila += Number(mesa.itensNaFila || 0);
    resumo.itensProntosRetirada += Number(mesa.itensProntosRetirada || 0);
  }
  resumo.consumo = arred2(resumo.consumo);
  resumo.pago = arred2(resumo.pago);
  resumo.saldo = arred2(resumo.saldo);
  return resumo;
}

export type ResumoVendas = { total: number; contas: number };

/** Vendas do período apenas das mesas visíveis no filtro atual. */
export function resumirVendas(vendas: VendasPeriodo | null | undefined, mesas: MesaPanorama[]): ResumoVendas {
  if (!vendas) return { total: 0, contas: 0 };
  const visiveis = new Set(mesas.map((m) => Number(m.numero)));
  let total = 0;
  let contas = 0;
  for (const linha of vendas.porMesa || []) {
    if (!visiveis.has(Number(linha.numero))) continue;
    total += Number(linha.total || 0);
    contas += Number(linha.contas || 0);
  }
  return { total: arred2(total), contas };
}

/** Resumo por praça para os filtros compactos (inclui "Sem praça"). */
export function resumoPorPraca(mesas: MesaPanorama[], pracas: Praca[]) {
  const base = pracas
    .slice()
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((praca) => {
      const lista = mesas.filter((m) => Number(m.pracaId) === Number(praca.id));
      return {
        id: praca.id as FiltroPraca,
        nome: praca.nome,
        total: lista.length,
        ocupadas: lista.filter((m) => m.sessaoId).length,
        criticas: lista.filter((m) => m.tempo?.id === "critica").length,
      };
    });
  const semPraca = mesas.filter((m) => m.pracaId == null);
  base.push({
    id: "sem",
    nome: "Sem praça",
    total: semPraca.length,
    ocupadas: semPraca.filter((m) => m.sessaoId).length,
    criticas: semPraca.filter((m) => m.tempo?.id === "critica").length,
  });
  return base;
}

/** Rótulo curto de situação de um item (mesmo vocabulário da operação). */
export const STATUS_ITEM: Record<string, string> = {
  recebido: "Aguardando preparo",
  em_producao: "Em preparo",
  concluido: "Pronto no setor",
  aceito: "Aceito pelo garçom",
  retirado: "Retirado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
