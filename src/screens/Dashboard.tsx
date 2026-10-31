import {
  Armchair, ArrowUpRight, ChartBar, CookingPot, CreditCard,
  CurrencyCircleDollar, HandCoins, Receipt, ShoppingBagOpen, Sparkle,
  Timer, TrendUp, Trophy, Users, Wallet, X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ControlesPaginacao, useLimiteLocal } from "../components/Paginacao";
import { api } from "../lib/api";
import type { DashboardGeral, DiaDashboard, PeriodoDashboard } from "../lib/dashboard";
import { BRL } from "../lib/utils";
import { usePub } from "../store/usePub";
import "./dashboard.css";

const STORAGE_PERIODO = "qradmin-dashboard-periodo";
const PERIODOS: { id: PeriodoDashboard; label: string }[] = [
  { id: "hoje", label: "Hoje" }, { id: "semana", label: "Semana" }, { id: "mes", label: "Mês" },
];
type CardId = "faturamento" | "pedidos" | "ticket" | "contas" | "servico" | "pagamentos" |
  "produtos" | "entrega" | "consumo" | "mesas" | "garcons" | "fila";
type Icone = ComponentType<{ size?: number; weight?: "regular" | "bold" | "duotone"; className?: string }>;
type Card = {
  id: CardId; label: string; valor: string; sub: string; Icon: Icone;
  cor: "violeta" | "ciano" | "lima" | "rosa" | "laranja";
  variacao?: string; atual?: boolean;
};

function periodoInicial(): PeriodoDashboard {
  try {
    const p = sessionStorage.getItem(STORAGE_PERIODO);
    if (p === "hoje" || p === "semana" || p === "mes") return p;
  } catch { /* navegador pode bloquear storage */ }
  return "hoje";
}

function respostaValida(d: DashboardGeral, periodo: PeriodoDashboard): boolean {
  const finito = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  const totais = (t: DashboardGeral["resumo"]) => Boolean(t &&
    [t.faturamento, t.vendasBrutas, t.servicoTotal, t.descontosTotal, t.contasFechadas, t.ticketMedio, t.pedidosTotal].every(finito) &&
    t.pedidosPorStatus && Object.values(t.pedidosPorStatus).every(finito));
  const dia = (v: DiaDashboard) => Boolean(v && typeof v.dia === "string" && typeof v.label === "string" &&
    [v.faturamento, v.vendasBrutas, v.servicoTotal, v.descontosTotal, v.contas, v.pedidos].every(finito));
  const entrega = (v: DashboardGeral["entrega"]) => Boolean(v && finito(v.unidades) && (v.mediaMinutos === null || finito(v.mediaMinutos)));
  return Boolean(d?.periodo?.chave === periodo && typeof d.periodo.from === "string" && typeof d.periodo.to === "string" &&
    typeof d.periodo.timezone === "string" && finito(d.periodo.dias) && d.periodo.dias > 0 &&
    typeof d.periodo.anterior?.from === "string" && typeof d.periodo.anterior?.to === "string" &&
    totais(d.resumo) && totais(d.anterior) && d.atual?.mesas && d.atual.itens &&
    [d.atual.sessoesAbertas, d.atual.consumoEntregue, d.atual.pagamentosParciais, d.atual.saldoPendente,
      d.atual.mesas.total, d.atual.mesas.ocupadas, d.atual.mesas.livres, d.atual.garconsAtivos,
      d.atual.itens.aguardando, d.atual.itens.preparo, d.atual.itens.prontos, d.atual.itens.retirados].every(finito) &&
    d.pagamentos && finito(d.pagamentos.semDetalhamento) && finito(d.pagamentos.excedente) &&
    Array.isArray(d.pagamentos.formas) && d.pagamentos.formas.every((f) => typeof f.forma === "string" && finito(f.valor)) &&
    Array.isArray(d.porDia) && d.porDia.every(dia) && Array.isArray(d.historico) && d.historico.every(dia) &&
    Array.isArray(d.topProdutos) && d.topProdutos.every((v) => finito(v.id) && typeof v.nome === "string" && finito(v.quantidade)) &&
    entrega(d.entrega) && entrega(d.entregaAnterior) && typeof d.atualizadoEm === "string");
}

function dataCurta(data: string) {
  const [ano, mes, dia] = data.split("-");
  return ano && mes && dia ? `${dia}/${mes}` : data;
}
function intervalo(from: string, to: string) {
  return from === to ? dataCurta(from) : `${dataCurta(from)} — ${dataCurta(to)}`;
}
function numero(n: number, casas = 1) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}
function variacao(atual: number | null, anterior: number | null) {
  if (atual == null || anterior == null) return "Sem comparação disponível";
  if (anterior === 0) return atual === 0 ? "Sem variação" : "Sem base anterior";
  const valor = ((atual - anterior) / Math.abs(anterior)) * 100;
  if (Math.abs(valor) < 0.05) return "Sem variação";
  return `${valor > 0 ? "+" : ""}${numero(valor)}% vs. período anterior`;
}
function horario(dash: DashboardGeral) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: dash.periodo.timezone, hour: "2-digit", minute: "2-digit",
    }).format(new Date(dash.atualizadoEm));
  } catch { return "—"; }
}
const formaNome = (forma: string) => ({
  dinheiro: "Dinheiro", pix: "Pix", cartao_debito: "Cartão de débito",
  cartao_credito: "Cartão de crédito", outro: "Outra forma",
}[forma] || forma.replace(/_/g, " "));
const statusNome = (status: string) => ({
  recebido: "Recebidos", em_producao: "Em produção", concluido: "Concluídos",
  entregue: "Entregues", cancelado: "Cancelados",
}[status] || status.replace(/_/g, " "));

/** O ponteiro é global, passivo e processado no máximo uma vez por frame.
 * Não há atualização do React durante o movimento nem listener com reduced motion. */
function useParallax(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let x = 0;
    let y = 0;
    const aplicar = () => {
      frame = 0;
      el.style.setProperty("--dash-hx", x.toFixed(3));
      el.style.setProperty("--dash-hy", y.toFixed(3));
    };
    const mover = (e: MouseEvent) => {
      x = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth - 0.5) * 2));
      y = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight - 0.5) * 2));
      if (!frame) frame = requestAnimationFrame(aplicar);
    };
    const configurar = () => {
      window.removeEventListener("mousemove", mover);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      el.style.setProperty("--dash-hx", "0");
      el.style.setProperty("--dash-hy", "0");
      if (!media.matches) window.addEventListener("mousemove", mover, { passive: true });
    };
    configurar();
    media.addEventListener("change", configurar);
    return () => {
      window.removeEventListener("mousemove", mover);
      media.removeEventListener("change", configurar);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}

function Cartao({ card, disponivel, onClick }: { card: Card; disponivel: boolean; onClick: () => void }) {
  const Icon = card.Icon;
  return (
    <button
      type="button" className={`card-neon card-neon--${card.cor}`} onClick={onClick}
      disabled={!disponivel} aria-haspopup="dialog"
      aria-label={`Detalhar ${card.label}: ${card.valor}`}
    >
      <span className="card-neon__top">
        <span className="card-neon__icon"><Icon size={20} weight="duotone" /></span>
        <ArrowUpRight className="card-neon__arrow" size={17} />
      </span>
      <span className="card-neon__label">{card.label}</span>
      <span className="metric-value num-extruded">{card.valor}</span>
      <span className="card-neon__bottom">
        <span className="card-neon__sub">{card.sub}</span>
        {card.variacao && <span className="card-neon__change">{card.variacao}</span>}
        {card.atual && <span className="card-neon__live"><span /> Agora</span>}
      </span>
    </button>
  );
}

function Linha({ nome, valor }: { nome: string; valor: ReactNode }) {
  return <div className="dash-detail-row"><span>{nome}</span><strong>{valor}</strong></div>;
}
function Comparacao({ atual, anterior, periodo, formatar = BRL }: {
  atual: number | null; anterior: number | null; periodo: DashboardGeral["periodo"];
  formatar?: (n: number) => string;
}) {
  return (
    <div className="dash-compare">
      <div><span>Período selecionado</span><strong>{atual == null ? "—" : formatar(atual)}</strong><small>{intervalo(periodo.from, periodo.to)}</small></div>
      <div><span>Período anterior</span><strong>{anterior == null ? "—" : formatar(anterior)}</strong><small>{intervalo(periodo.anterior.from, periodo.anterior.to)}</small></div>
      <p>{variacao(atual, anterior)} · comparação com {periodo.dias} {periodo.dias === 1 ? "dia" : "dias"} imediatamente {periodo.dias === 1 ? "anterior" : "anteriores"}.</p>
    </div>
  );
}
function MiniHistorico({ dias, campo, formatar }: { dias: DiaDashboard[]; campo: "faturamento" | "pedidos" | "contas" | "servicoTotal"; formatar: (n: number) => string }) {
  const visiveis = dias.slice(-7);
  return (
    <div className="dash-mini">
      <h4>{dias.length > 7 ? "Últimos 7 dias do período" : "Histórico do período"}</h4>
      {visiveis.map((d) => <Linha key={d.dia} nome={`${d.label} · ${dataCurta(d.dia)}`} valor={formatar(d[campo])} />)}
    </div>
  );
}

function Detalhes({ id, dash }: { id: CardId; dash: DashboardGeral }) {
  const r = dash.resumo;
  const ant = dash.anterior;
  const p = dash.periodo;
  const inteiro = (n: number) => numero(n, 0);
  const comp = (a: number | null, b: number | null, fmt?: (n: number) => string) =>
    <Comparacao atual={a} anterior={b} periodo={p} formatar={fmt} />;
  if (id === "faturamento") return <>
    {comp(r.faturamento, ant.faturamento)}
    <div className="dash-detail-list">
      <Linha nome="Vendas brutas" valor={BRL(r.vendasBrutas)} />
      <Linha nome="Descontos" valor={`− ${BRL(r.descontosTotal)}`} />
      <Linha nome="Taxa de serviço" valor={`+ ${BRL(r.servicoTotal)}`} />
      <Linha nome="Total cobrado" valor={BRL(r.faturamento)} />
      <Linha nome="Média por dia" valor={BRL(r.faturamento / p.dias)} />
      <Linha nome="Média equivalente a 7 dias" valor={BRL(r.faturamento / p.dias * 7)} />
    </div>
    <p className="dash-detail-note">Contas fechadas no período. A média equivalente é a média diária multiplicada por 7, não uma previsão.</p>
    <MiniHistorico dias={dash.porDia} campo="faturamento" formatar={BRL} />
  </>;
  if (id === "pedidos") return <>
    {comp(r.pedidosTotal, ant.pedidosTotal, inteiro)}
    <div className="dash-detail-list"><Linha nome="Média de pedidos por dia" valor={numero(r.pedidosTotal / p.dias)} />
      {Object.entries(r.pedidosPorStatus).map(([s, n]) => <Linha key={s} nome={statusNome(s)} valor={inteiro(n)} />)}
    </div>
    <p className="dash-detail-note">Pedidos criados no período, inclusive cancelados. O estado apresentado é o atual.</p>
    <MiniHistorico dias={dash.porDia} campo="pedidos" formatar={inteiro} />
  </>;
  if (id === "ticket") return <>
    {comp(r.contasFechadas ? r.ticketMedio : null, ant.contasFechadas ? ant.ticketMedio : null)}
    <div className="dash-detail-list"><Linha nome="Faturamento" valor={BRL(r.faturamento)} /><Linha nome="Contas fechadas" valor={inteiro(r.contasFechadas)} /></div>
    <p className="dash-detail-note">Ticket médio = total cobrado dividido pelo número de contas fechadas. Sem contas, não há média.</p>
  </>;
  if (id === "contas") return <>
    {comp(r.contasFechadas, ant.contasFechadas, inteiro)}
    <div className="dash-detail-list"><Linha nome="Média por dia" valor={numero(r.contasFechadas / p.dias)} /><Linha nome="Ticket médio" valor={r.contasFechadas ? BRL(r.ticketMedio) : "—"} /></div>
    <MiniHistorico dias={dash.porDia} campo="contas" formatar={inteiro} />
  </>;
  if (id === "servico") return <>
    {comp(r.servicoTotal, ant.servicoTotal)}
    <div className="dash-detail-list"><Linha nome="Média de serviço por dia" valor={BRL(r.servicoTotal / p.dias)} /><Linha nome="Descontos no período" valor={BRL(r.descontosTotal)} /></div>
    <p className="dash-detail-note">Taxas efetivamente registradas no fechamento, incluindo ajustes e isenções.</p>
    <MiniHistorico dias={dash.porDia} campo="servicoTotal" formatar={BRL} />
  </>;
  if (id === "pagamentos") return <>
    <p className="dash-detail-intro">Formas registradas em contas fechadas no período, incluindo pagamentos parciais feitos em dias anteriores.</p>
    <div className="dash-detail-list">
      {dash.pagamentos.formas.map((f) => <Linha key={f.forma} nome={formaNome(f.forma)} valor={BRL(f.valor)} />)}
      {dash.pagamentos.semDetalhamento > 0 && <Linha nome="Sem detalhamento de pagamento" valor={BRL(dash.pagamentos.semDetalhamento)} />}
      {!dash.pagamentos.formas.length && dash.pagamentos.semDetalhamento === 0 && <p className="dash-detail-note">Nenhum pagamento registrado no período.</p>}
      <Linha nome="Total cobrado nas contas fechadas" valor={BRL(r.faturamento)} />
    </div>
    {dash.pagamentos.excedente > 0 && <p className="dash-detail-warning">Há {BRL(dash.pagamentos.excedente)} em lançamentos acima do valor cobrado em contas históricas. Confira os registros do caixa.</p>}
    <p className="dash-detail-note">Valores sem lançamento de pagamento ficam sem detalhamento; não são atribuídos automaticamente à última forma.</p>
  </>;
  if (id === "produtos") return <>
    <p className="dash-detail-intro">Até 50 produtos mais pedidos, por quantidade, nos pedidos criados entre {intervalo(p.from, p.to)}.</p>
    <div className="dash-detail-list">{dash.topProdutos.length
      ? dash.topProdutos.map((item, i) => <Linha key={item.id} nome={`${i + 1}. ${item.nome}`} valor={`${item.quantidade} un.`} />)
      : <p className="dash-detail-note">Nenhum item pedido no período.</p>}</div>
    <p className="dash-detail-note">Itens e pedidos cancelados não entram no ranking; itens ainda em preparo podem aparecer.</p>
  </>;
  if (id === "entrega") return <>
    {comp(dash.entrega.mediaMinutos, dash.entregaAnterior.mediaMinutos, (n) => `${numero(n)} min`)}
    <div className="dash-detail-list"><Linha nome="Unidades com horário de entrega" valor={inteiro(dash.entrega.unidades)} /></div>
    <p className="dash-detail-note">Tempo entre criação do pedido e entrega, ponderado por unidade. Itens antigos sem horário registrado não entram na média.</p>
  </>;
  if (id === "consumo") return <>
    <div className="dash-detail-list">
      <Linha nome="Comandas abertas agora" valor={inteiro(dash.atual.sessoesAbertas)} />
      <Linha nome="Consumo entregue" valor={BRL(dash.atual.consumoEntregue)} />
      <Linha nome="Pagamentos parciais" valor={BRL(dash.atual.pagamentosParciais)} />
      <Linha nome="Saldo pendente estimado" valor={BRL(dash.atual.saldoPendente)} />
    </div>
    <p className="dash-detail-note">Retrato atual, independente do filtro. O consumo inclui adicionais e não abate pagamentos; o saldo não inclui eventuais descontos ou serviço no fechamento.</p>
  </>;
  if (id === "mesas") return <>
    <div className="dash-detail-list"><Linha nome="Mesas ocupadas" valor={inteiro(dash.atual.mesas.ocupadas)} /><Linha nome="Mesas livres" valor={inteiro(dash.atual.mesas.livres)} /><Linha nome="Mesas habilitadas" valor={inteiro(dash.atual.mesas.total)} /></div>
    <p className="dash-detail-note">Retrato atual das mesas habilitadas, independente do período selecionado.</p>
  </>;
  if (id === "garcons") return <>
    <div className="dash-detail-list"><Linha nome="Garçons com cadastro ativo" valor={inteiro(dash.atual.garconsAtivos)} /></div>
    <p className="dash-detail-note">Retrato atual dos cadastros habilitados, independente do período. Não indica presença ou turno em andamento.</p>
  </>;
  return <>
    <div className="dash-detail-list"><Linha nome="Aguardando preparo" valor={`${dash.atual.itens.aguardando} un.`} /><Linha nome="Em preparo" valor={`${dash.atual.itens.preparo} un.`} /><Linha nome="Prontos para retirada" valor={`${dash.atual.itens.prontos} un.`} /><Linha nome="Retirados, em entrega" valor={`${dash.atual.itens.retirados} un.`} /></div>
    <p className="dash-detail-note">Quantidades dos itens em comandas abertas agora, independente do período.</p>
  </>;
}

function Grafico({ dias, periodo, loading }: { dias: DiaDashboard[]; periodo: PeriodoDashboard; loading: boolean }) {
  const max = Math.max(1, ...dias.map((d) => d.faturamento));
  const compacto = dias.length > 7;
  return <section aria-label={periodo === "hoje" ? "Semana da casa" : "Faturamento por dia"} className="dash-panel dash-chart">
    <div className="dash-panel__head">
      <div><p className="dash-kicker">EVOLUÇÃO</p><h3>{periodo === "hoje" ? "Semana da casa" : "Faturamento por dia"}</h3><p>{periodo === "hoje" ? "Últimos 7 dias · histórico independente do filtro" : "Contas fechadas no período selecionado"}</p></div>
      <span className="dash-panel__icon"><ChartBar size={19} weight="duotone" /></span>
    </div>
    {dias.length ? <div className="dash-chart__scroll">
      <div className="dash-chart__bars" style={compacto ? { minWidth: `${dias.length * 42}px` } : undefined}>
        {dias.map((d) => {
          const valor = BRL(d.faturamento);
          const nome = periodo === "hoje" ? d.label : `${d.label} ${dataCurta(d.dia)}`;
          return <div key={d.dia} className="dash-chart__column">
            <div className="dash-chart__track" role="img" aria-label={`${nome}: ${valor}`} title={`${nome}: ${valor}`}>
              <div className="dash-chart__fill" style={{ transform: `scaleY(${Math.max(0.025, d.faturamento / max)})` }} />
              <span className="week-bar-value" aria-hidden="true">{valor}</span>
            </div>
            <span className="dash-chart__day">{compacto ? dataCurta(d.dia) : d.label}</span>
          </div>;
        })}
      </div>
    </div> : <p className="dash-chart__empty" role="status">{loading ? "Carregando vendas da semana…" : "Dados de vendas da semana indisponíveis."}</p>}
  </section>;
}

export default function Dashboard() {
  const produtos = usePub((s) => s.produtos);
  const [periodo, setPeriodo] = useState<PeriodoDashboard>(periodoInicial);
  const [dash, setDash] = useState<DashboardGeral | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [selecionado, setSelecionado] = useState<CardId | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  useParallax(stage);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_PERIODO, periodo); } catch { /* filtro ainda funciona sem storage */ }
    let ativo = true;
    let sequencia = 0;
    const carregar = async () => {
      const pedido = ++sequencia;
      try {
        const dados = await api.adminDashboardGeral(periodo);
        if (!respostaValida(dados, periodo)) throw new Error("Resposta de dashboard inválida");
        if (ativo && pedido === sequencia) { setDash(dados); setErro(false); setLoading(false); }
      } catch {
        if (ativo && pedido === sequencia) { setErro(true); setLoading(false); }
      }
    };
    void carregar();
    const timer = window.setInterval(carregar, 30_000);
    return () => { ativo = false; window.clearInterval(timer); };
  }, [periodo, tentativa]);

  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;
    if (selecionado && dash && !el.open) el.showModal();
    else if ((!selecionado || !dash) && el.open) el.close();
  }, [selecionado, dash]);

  const alterarPeriodo = (novo: PeriodoDashboard) => {
    if (novo === periodo) return;
    setSelecionado(null);
    setDash(null);
    setErro(false);
    setLoading(true);
    setPeriodo(novo);
  };
  const r = dash?.resumo;
  const a = dash?.anterior;
  const agora = dash?.atual;
  const valor = (n: number | undefined, formato: (n: number) => string) => n == null ? "—" : formato(n);
  const carregando = loading ? "Carregando dados…" : "Dados indisponíveis";
  const compara = (atual: number | undefined, anterior: number | undefined) =>
    atual == null || anterior == null ? undefined : variacao(atual, anterior);
  const registrado = dash?.pagamentos.formas.reduce((s, f) => s + f.valor, 0);
  const primeiro = dash?.topProdutos[0];
  const qtdFila = agora ? agora.itens.aguardando + agora.itens.preparo + agora.itens.prontos + agora.itens.retirados : undefined;
  const metricas: Card[] = [
    { id: "faturamento", label: "Faturamento", valor: valor(r?.faturamento, BRL), sub: dash ? "Contas fechadas" : carregando, Icon: CurrencyCircleDollar, cor: "violeta", variacao: compara(r?.faturamento, a?.faturamento) },
    { id: "pedidos", label: "Pedidos", valor: valor(r?.pedidosTotal, (n) => numero(n, 0)), sub: dash ? "Criados no período" : carregando, Icon: ShoppingBagOpen, cor: "ciano", variacao: compara(r?.pedidosTotal, a?.pedidosTotal) },
    { id: "ticket", label: "Ticket médio", valor: r && r.contasFechadas ? BRL(r.ticketMedio) : "—", sub: dash ? "Por conta fechada" : carregando, Icon: TrendUp, cor: "lima", variacao: r && a ? variacao(r.contasFechadas ? r.ticketMedio : null, a.contasFechadas ? a.ticketMedio : null) : undefined },
    { id: "contas", label: "Contas fechadas", valor: valor(r?.contasFechadas, (n) => numero(n, 0)), sub: dash ? "Finalizadas no caixa" : carregando, Icon: Receipt, cor: "rosa", variacao: compara(r?.contasFechadas, a?.contasFechadas) },
    { id: "servico", label: "Taxa de serviço", valor: valor(r?.servicoTotal, BRL), sub: dash ? "Registrada no fechamento" : carregando, Icon: HandCoins, cor: "laranja", variacao: compara(r?.servicoTotal, a?.servicoTotal) },
    { id: "pagamentos", label: "Pagamentos", valor: valor(registrado, BRL), sub: dash ? "Valores registrados por forma" : carregando, Icon: CreditCard, cor: "ciano" },
    { id: "produtos", label: "Mais pedidos", valor: primeiro ? `${primeiro.quantidade} un.` : "—", sub: dash ? (primeiro?.nome || "Nenhum item no período") : carregando, Icon: Trophy, cor: "lima" },
    { id: "entrega", label: "Tempo de entrega", valor: dash?.entrega.mediaMinutos != null ? `${numero(dash.entrega.mediaMinutos)} min` : "—", sub: dash ? (dash.entrega.unidades ? `${dash.entrega.unidades} unidades com horário` : "Sem horários registrados") : carregando, Icon: Timer, cor: "rosa", variacao: dash ? variacao(dash.entrega.mediaMinutos, dash.entregaAnterior.mediaMinutos) : undefined },
  ];
  const operacao: Card[] = [
    { id: "consumo", label: "Consumo em aberto", valor: valor(agora?.consumoEntregue, BRL), sub: dash ? "Itens entregues em comandas abertas" : carregando, Icon: Wallet, cor: "violeta", atual: true },
    { id: "mesas", label: "Mesas ocupadas", valor: agora ? `${agora.mesas.ocupadas} / ${agora.mesas.total}` : "—", sub: agora ? `${agora.mesas.livres} livres no salão` : carregando, Icon: Armchair, cor: "ciano", atual: true },
    { id: "garcons", label: "Garçons ativos", valor: valor(agora?.garconsAtivos, (n) => numero(n, 0)), sub: dash ? "Cadastros habilitados" : carregando, Icon: Users, cor: "lima", atual: true },
    { id: "fila", label: "Itens em operação", valor: valor(qtdFila, (n) => numero(n, 0)), sub: agora ? `${agora.itens.preparo} em preparo · ${agora.itens.prontos} prontos` : carregando, Icon: CookingPot, cor: "laranja", atual: true },
  ];
  const todos = [...metricas, ...operacao];
  const atualSelecionado = todos.find((c) => c.id === selecionado);
  const top = dash?.topProdutos || [];
  const topVisiveis = useLimiteLocal(top, 5, periodo);
  const maxTop = Math.max(1, ...top.map((p) => p.quantidade));
  const diasGrafico = dash ? (periodo === "hoje" ? dash.historico : dash.porDia) : [];

  return <div className="dashboard-stage" ref={stage}>
    <header className="dashboard-intro">
      <div className="dashboard-intro__copy">
        <p className="dash-eyebrow"><span /> PAINEL DE CONTROLE <span className="dash-eyebrow__sep">/</span> VISÃO GERAL</p>
        <h2>Os números da sua casa<span>.</span></h2>
        <p>Acompanhe o que importa, do salão ao caixa.</p>
      </div>
      <div className="dashboard-period">
        <span>PERÍODO DE ANÁLISE</span>
        <div className="dashboard-period__group" role="group" aria-label="Período do dashboard">
          {PERIODOS.map((opcao) => <button type="button" key={opcao.id} aria-pressed={periodo === opcao.id} onClick={() => alterarPeriodo(opcao.id)}>{opcao.label}</button>)}
        </div>
        <small>Semana desde segunda · mês desde o dia 1</small>
      </div>
    </header>

    {erro && <div className="dash-error" role="alert">
      <span>{dash ? "Não foi possível atualizar. Exibindo os últimos dados carregados." : "Não foi possível carregar os indicadores. Tente novamente."}</span>
      <button type="button" onClick={() => { setLoading(true); setErro(false); setTentativa((n) => n + 1); }}>Tentar novamente</button>
    </div>}

    <section aria-label="Indicadores do período">
      <div className="dash-section-heading"><div><p className="dash-kicker">01 / MOVIMENTO</p><h3>Visão do período</h3></div>
        <span className="dash-section-meta">{dash ? intervalo(dash.periodo.from, dash.periodo.to) : "—"} <span>·</span> {dash?.periodo.timezone || "fuso da casa"}</span>
      </div>
      <div className="dashboard-grid">{metricas.map((card) => <Cartao key={card.id} card={card} disponivel={Boolean(dash)} onClick={() => setSelecionado(card.id)} />)}</div>
    </section>

    <section aria-label="Indicadores atuais">
      <div className="dash-section-heading"><div><p className="dash-kicker">02 / OPERAÇÃO</p><h3>A casa agora <span className="dash-now"><span /> AGORA</span></h3></div>
        <span className="dash-section-meta">{dash ? `Atualizado às ${horario(dash)} · a cada 30 s` : "Retrato atual"}</span>
      </div>
      <div className="dashboard-grid">{operacao.map((card) => <Cartao key={card.id} card={card} disponivel={Boolean(dash)} onClick={() => setSelecionado(card.id)} />)}</div>
    </section>

    <div className="dashboard-bottom">
      <Grafico dias={diasGrafico} periodo={periodo} loading={loading} />
      <section aria-label="Mais pedidos" className="dash-panel dash-ranking">
        <div className="dash-panel__head"><div><p className="dash-kicker">DESTAQUES DO PERÍODO</p><h3>Mais pedidos</h3><p>Itens não cancelados por quantidade</p></div><span className="dash-panel__icon dash-panel__icon--lima"><Trophy size={19} weight="duotone" /></span></div>
        {!dash ? <p className="dash-ranking__empty">{carregando}</p> : !top.length ? <p className="dash-ranking__empty">Nenhum item pedido no período.</p> : <ul>
          {topVisiveis.itens.map((item, index) => {
            const produto = produtos.find((p) => p.id === item.id) || produtos.find((p) => p.nome === item.nome);
            return <li key={item.id} className="dash-ranking__item">
              <span className="dash-ranking__number">{String(index + 1).padStart(2, "0")}</span>
              {produto?.foto ? <img className="dash-ranking__image" src={produto.foto} alt="" /> : <span className="dash-ranking__image dash-ranking__placeholder" aria-hidden="true">{item.nome.slice(0, 1).toUpperCase()}</span>}
              <div className="dash-ranking__content"><div><strong>{item.nome}</strong><span>{item.quantidade} un.</span></div><div className="dash-ranking__track"><span style={{ width: `${item.quantidade / maxTop * 100}%` }} /></div></div>
            </li>;
          })}
        </ul>}
        <ControlesPaginacao {...topVisiveis} className="dash-ranking__pagination" />
      </section>
    </div>
    <p className="dashboard-footnote"><Sparkle size={15} /> Valores do período usam a data de fechamento. Indicadores marcados “agora” são independentes do filtro.</p>

    <dialog ref={dialogo} className="dash-dialog" aria-labelledby="dashboard-dialog-title" onClose={() => setSelecionado(null)} onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
      {selecionado && dash && atualSelecionado && <>
        <div className="dash-dialog__header"><div><p className="dash-kicker">DETALHES DO INDICADOR</p><h3 id="dashboard-dialog-title">{atualSelecionado.label}</h3><p>{atualSelecionado.atual ? "Retrato atual da operação" : `${intervalo(dash.periodo.from, dash.periodo.to)} · ${dash.periodo.timezone}`}</p></div>
          <button type="button" aria-label="Fechar detalhes" className="dash-dialog__close" onClick={() => dialogo.current?.close()}><X size={20} /></button>
        </div>
        <Detalhes id={selecionado} dash={dash} />
      </>}
    </dialog>
  </div>;
}
