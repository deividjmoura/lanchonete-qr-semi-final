import {
  Armchair, ArrowUpRight, ArrowsOut, ChartBar, CookingPot, CreditCard,
  CurrencyCircleDollar, Eye, EyeSlash, HandCoins, Receipt, ShoppingBagOpen, Sparkle,
  Timer, TrendUp, Trophy, Users, Wallet, X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ControlesPaginacao, useLimiteLocal } from "../components/Paginacao";
import { api } from "../lib/api";
import type { DashboardGeral, DiaDashboard, PeriodoDashboard } from "../lib/dashboard";
import { BRL } from "../lib/utils";
import { usePub } from "../store/usePub";
import { confirmarAcao } from "../lib/confirmacao";
import "./dashboard.css";

const STORAGE_PERIODO = "qradmin-dashboard-periodo";
const STORAGE_LAYOUT = "qradmin-dashboard-layout-v1";
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

type CardLayout = { w: number; h: number; visible: boolean };
type HeadingLayout = { label: string; title: string; labelSize: number; titleSize: number };
type DashboardLayout = {
  order: CardId[];
  sizes: Record<CardId, CardLayout>;
  headings: { movimento: HeadingLayout; operacao: HeadingLayout };
};
const CARD_IDS: CardId[] = ["faturamento", "pedidos", "ticket", "contas", "servico", "pagamentos", "produtos", "entrega", "consumo", "mesas", "garcons", "fila"];
const LAYOUT_PADRAO: DashboardLayout = {
  order: CARD_IDS,
  sizes: Object.fromEntries(CARD_IDS.map((id) => [id, { w: 1, h: 1, visible: true }])) as Record<CardId, CardLayout>,
  headings: {
    movimento: { label: "01 / MOVIMENTO", title: "Visão do período", labelSize: 10, titleSize: 23 },
    operacao: { label: "02 / OPERAÇÃO", title: "A casa agora", labelSize: 10, titleSize: 23 },
  },
};
function lerLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(STORAGE_LAYOUT);
    if (!raw) return LAYOUT_PADRAO;
    const parsed = JSON.parse(raw) as Partial<DashboardLayout>;
    const order = Array.isArray(parsed.order)
      ? [...new Set(parsed.order.filter((id): id is CardId => CARD_IDS.includes(id as CardId))), ...CARD_IDS.filter((id) => !parsed.order!.includes(id))]
      : CARD_IDS;
    const sizes = { ...LAYOUT_PADRAO.sizes };
    for (const id of CARD_IDS) {
      const size = parsed.sizes?.[id];
      if (size) sizes[id] = { w: Math.max(1, Math.min(4, Number(size.w) || 1)), h: Math.max(1, Math.min(3, Number(size.h) || 1)), visible: typeof size.visible === "boolean" ? size.visible : true };
    }
    const headings = { ...LAYOUT_PADRAO.headings };
    for (const key of ["movimento", "operacao"] as const) {
      const h = parsed.headings?.[key];
      if (h) headings[key] = {
        label: typeof h.label === "string" ? h.label.slice(0, 60) : headings[key].label,
        title: typeof h.title === "string" ? h.title.slice(0, 80) : headings[key].title,
        labelSize: Math.max(8, Math.min(18, Number(h.labelSize) || 10)),
        titleSize: Math.max(16, Math.min(40, Number(h.titleSize) || 23)),
      };
    }
    return { order, sizes, headings };
  } catch { return LAYOUT_PADRAO; }
}

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

function Cartao({ card, disponivel, onClick, editando, layout, onResize, onToggleVisibility, onDragStart, onDrop }: {
  card: Card; disponivel: boolean; onClick: () => void; editando: boolean;
  layout: CardLayout; onResize: (w: number, h: number) => void; onToggleVisibility: () => void;
  onDragStart: (id: CardId) => void; onDrop: (id: CardId) => void;
}) {
  const Icon = card.Icon;
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number; cellW: number; cellH: number; maxW: number } | null>(null);
  const iniciarResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const grid = event.currentTarget.closest(".dashboard-grid") as HTMLElement | null;
    if (!grid) return;
    const style = window.getComputedStyle(grid);
    const columns = Math.max(1, style.gridTemplateColumns.split(" ").filter(Boolean).length);
    const columnGap = Number.parseFloat(style.columnGap) || 14;
    const rowGap = Number.parseFloat(style.rowGap) || 14;
    const cellW = (grid.clientWidth - columnGap * (columns - 1)) / columns;
    const cellH = Number.parseFloat(style.gridAutoRows) || 176;
    resizeStart.current = { x: event.clientX, y: event.clientY, w: Math.min(layout.w, columns), h: layout.h, cellW: cellW + columnGap, cellH: cellH + rowGap, maxW: columns };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moverResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = resizeStart.current;
    if (!start) return;
    event.preventDefault();
    const w = Math.max(1, Math.min(start.maxW, start.w + Math.round((event.clientX - start.x) / start.cellW)));
    const h = Math.max(1, Math.min(3, start.h + Math.round((event.clientY - start.y) / start.cellH)));
    onResize(w, h);
  };
  const finalizarResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    resizeStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <article
      className={`card-neon card-neon--${card.cor} ${editando ? "card-neon--editing" : ""} ${layout.visible ? "" : "card-neon--hidden"}`}
      style={{ gridColumn: `span ${layout.w}`, gridRow: `span ${layout.h}` }}
      draggable={editando}
      onDragStart={(event) => { if (!editando || (event.target as HTMLElement).closest(".card-neon__resize-handle, .card-neon__visibility")) { event.preventDefault(); return; } onDragStart(card.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.id); }}
      onDragOver={(event) => { if (editando) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
      onDrop={(event) => { if (editando) { event.preventDefault(); onDrop(card.id); } }}
      onDragEnd={() => onDrop(card.id)}
      data-dashboard-card={card.id}
      data-visible={layout.visible ? "true" : "false"}
    >
      <button type="button" className="card-neon__open" onClick={onClick} disabled={!disponivel || editando || !layout.visible}
        aria-haspopup="dialog" aria-label={`Detalhar ${card.label}: ${card.valor}`}>
        <span className="card-neon__top">
          <span className="card-neon__icon"><Icon size={22} weight="duotone" /></span>
          <ArrowUpRight className="card-neon__arrow" size={18} />
        </span>
        <span className="card-neon__label">{card.label}</span>
        <span className="metric-value num-extruded">{card.valor}</span>
        <span className="card-neon__bottom">
          <span className="card-neon__sub">{card.sub}</span>
          {card.variacao && <span className="card-neon__change">{card.variacao}</span>}
          {card.atual && <span className="card-neon__live"><span /> Agora</span>}
        </span>
      </button>
      {editando && <>
        <button type="button" className="card-neon__visibility" onClick={onToggleVisibility}
          aria-label={layout.visible ? `Ocultar ${card.label}` : `Exibir ${card.label}`}
          aria-pressed={layout.visible} title={layout.visible ? "Ocultar card" : "Exibir card"}>
          {layout.visible ? <Eye size={17} weight="bold" /> : <EyeSlash size={17} weight="bold" />}
        </button>
        <button type="button" className="card-neon__resize-handle" aria-label={`Arraste para redimensionar ${card.label}`}
          title="Arraste para ajustar largura e altura"
          onPointerDown={iniciarResize} onPointerMove={moverResize}
          onPointerUp={finalizarResize} onPointerCancel={finalizarResize}>
          <ArrowsOut size={15} weight="bold" />
        </button>
      </>}
    </article>
  );
}

function CabecalhoEditavel({ tipo, config, editando, onChange, meta }: {
  tipo: "movimento" | "operacao"; config: HeadingLayout; editando: boolean;
  onChange: (key: keyof HeadingLayout, value: string | number) => void; meta: ReactNode;
}) {
  return <div className="dash-section-heading" data-dashboard-heading={tipo}>
    <div>
      {editando ? <>
        <input aria-label={`Legenda ${tipo}`} value={config.label} onChange={(e) => onChange("label", e.target.value)} className="dash-heading-input dash-heading-input--label" style={{ fontSize: config.labelSize }} />
        <input aria-label={`Título ${tipo}`} value={config.title} onChange={(e) => onChange("title", e.target.value)} className="dash-heading-input dash-heading-input--title" style={{ fontSize: config.titleSize }} />
        <div className="dash-heading-sizes">
          <label>Legenda <input aria-label={`Tamanho da legenda ${tipo}`} type="range" min="8" max="18" value={config.labelSize} onChange={(e) => onChange("labelSize", Number(e.target.value))} /><output>{config.labelSize}px</output></label>
          <label>Título <input aria-label={`Tamanho do título ${tipo}`} type="range" min="16" max="40" value={config.titleSize} onChange={(e) => onChange("titleSize", Number(e.target.value))} /><output>{config.titleSize}px</output></label>
        </div>
      </> : <>
        <p className="dash-kicker" style={{ fontSize: config.labelSize }}>{config.label}</p>
        <h3 style={{ fontSize: config.titleSize }}>{config.title}{tipo === "operacao" && <span className="dash-now"><span /> AGORA</span>}</h3>
      </>}
    </div>
    <span className="dash-section-meta">{meta}</span>
  </div>;
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

function WidgetFrame({ id, layout, editando, onToggleVisibility, onResize, onDragStart, children }: {
  id: "grafico" | "ranking"; layout: WidgetLayout; editando: boolean;
  onToggleVisibility: () => void; onResize: (w: number, h: number) => void;
  onDragStart: (id: WidgetId) => void; children: ReactNode;
}) {
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number; cellW: number; cellH: number } | null>(null);
  const iniciarResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation();
    const grid = event.currentTarget.closest(".dashboard-grid") as HTMLElement | null;
    if (!grid) return;
    const style = window.getComputedStyle(grid);
    const gap = Number.parseFloat(style.columnGap) || 14;
    const rowGap = Number.parseFloat(style.rowGap) || 14;
    const cellW = (grid.clientWidth - gap * 11) / 12;
    const cellH = Number.parseFloat(style.gridAutoRows) || 84;
    resizeStart.current = { x: event.clientX, y: event.clientY, w: layout.w, h: layout.h, cellW: cellW + gap, cellH: cellH + rowGap };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moverResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = resizeStart.current; if (!start) return;
    event.preventDefault();
    onResize(Math.max(1, Math.min(12 - layout.x, start.w + Math.round((event.clientX - start.x) / start.cellW))),
      Math.max(1, Math.min(20, start.h + Math.round((event.clientY - start.y) / start.cellH))));
  };
  const finalizarResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    resizeStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className={`dashboard-widget ${editando ? "dashboard-widget--editing" : ""} ${layout.visible ? "" : "dashboard-widget--hidden"}`}
    style={{ gridColumn: `${layout.x + 1} / span ${layout.w}`, gridRow: `${layout.y + 1} / span ${layout.h}` }}
    draggable={editando}
    onDragStart={(event) => { if (!editando || (event.target as HTMLElement).closest(".dashboard-widget__resize, .dashboard-widget__visibility")) { event.preventDefault(); return; } onDragStart(id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }}
    data-dashboard-widget={id} data-visible={layout.visible ? "true" : "false"}>
    {children}
    {editando && <>
      <button type="button" className="dashboard-widget__visibility" onClick={onToggleVisibility}
        aria-label={layout.visible ? `Ocultar ${id === "grafico" ? "Evolução da semana" : "Mais pedidos"}` : `Exibir ${id === "grafico" ? "Evolução da semana" : "Mais pedidos"}`}
        aria-pressed={layout.visible}>{layout.visible ? <Eye size={17} weight="bold" /> : <EyeSlash size={17} weight="bold" />}</button>
      <button type="button" className="dashboard-widget__resize" aria-label={`Arraste para redimensionar ${id === "grafico" ? "Evolução da semana" : "Mais pedidos"}`}
        onPointerDown={iniciarResize} onPointerMove={moverResize} onPointerUp={finalizarResize}
        onPointerCancel={finalizarResize}><ArrowsOut size={15} weight="bold" /></button>
    </>}
  </div>;
}

export default function Dashboard({ editMode = false }: { editMode?: boolean }) {
  const produtos = usePub((s) => s.produtos);
  const [periodo, setPeriodo] = useState<PeriodoDashboard>(periodoInicial);
  const [dash, setDash] = useState<DashboardGeral | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [selecionado, setSelecionado] = useState<CardId | null>(null);
  const [layout, setLayout] = useState<DashboardLayout>(lerLayout);
  const [layoutSalvo, setLayoutSalvo] = useState(true);
  const [arrastado, setArrastado] = useState<WidgetId | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  useParallax(stage);

  useEffect(() => { if (!editMode) setArrastado(null); }, [editMode]);

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
  const redimensionar = (id: WidgetId, w: number, h: number) => {
    setLayout((atual) => {
      const atualWidget = atual.widgets[id];
      const candidato = { ...atualWidget, w: Math.max(1, Math.min(12 - atualWidget.x, w)), h: Math.max(1, Math.min(20, h)) };
      if (!canPlaceWidget(atual.widgets, id, candidato)) return atual;
      setLayoutSalvo(false);
      return { widgets: { ...atual.widgets, [id]: candidato } };
    });
  };
  const alternarVisibilidade = (id: WidgetId) => {
    setLayoutSalvo(false);
    setLayout((atual) => ({ widgets: { ...atual.widgets, [id]: { ...atual.widgets[id], visible: !atual.widgets[id].visible } } }));
  };
  const moverWidget = (id: WidgetId, x: number, y: number) => {
    setLayout((atual) => {
      const widget = atual.widgets[id];
      const posicao = findAvailablePosition(atual.widgets, id, { ...widget, x, y });
      setLayoutSalvo(false);
      return { widgets: { ...atual.widgets, [id]: { ...widget, ...posicao } } };
    });
  };
  const soltarWidget = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const id = (event.dataTransfer.getData("text/plain") || arrastado) as WidgetId | null;
    if (!id || !WIDGET_IDS.includes(id)) { setArrastado(null); return; }
    const grid = event.currentTarget;
    const rect = grid.getBoundingClientRect();
    const style = window.getComputedStyle(grid);
    const gap = Number.parseFloat(style.columnGap) || 14;
    const rowGap = Number.parseFloat(style.rowGap) || 14;
    const cellW = (grid.clientWidth - gap * 11) / 12;
    const cellH = Number.parseFloat(style.gridAutoRows) || 84;
    const x = Math.max(0, Math.min(11, Math.floor((event.clientX - rect.left) / (cellW + gap))));
    const y = Math.max(0, Math.floor((event.clientY - rect.top) / (cellH + rowGap)));
    moverWidget(id, x, y);
    setArrastado(null);
  };
  const salvarLayout = () => {
    try { localStorage.setItem(STORAGE_LAYOUT, JSON.stringify(layout)); setLayoutSalvo(true); }
    catch { setLayoutSalvo(false); }
  };
  const restaurarLayout = async () => {
    const confirmado = await confirmarAcao({
      titulo: "Restaurar o dashboard padrão?",
      mensagem: "A posição, o tamanho e a visibilidade de todos os cards e painéis serão substituídos pelo layout original. Essa alteração também será salva neste navegador.",
      confirmar: "Restaurar padrão",
      perigo: true,
    });
    if (!confirmado) return;
    setLayout(LAYOUT_PADRAO);
    try { localStorage.setItem(STORAGE_LAYOUT, JSON.stringify(LAYOUT_PADRAO)); setLayoutSalvo(true); }
    catch { setLayoutSalvo(false); }
  };
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

    {editMode && <div className="dashboard-edit-banner" role="status">
      <span><strong>Modo de edição</strong> · arraste qualquer card ou painel para posicionar; puxe a alça no canto inferior direito para redimensionar; use o olho para ocultar ou exibir. O sistema impede sobreposição.</span>
      <div className="dashboard-edit-actions">
        <button type="button" onClick={salvarLayout} disabled={layoutSalvo} aria-label="Salvar layout do dashboard">{layoutSalvo ? "Layout salvo" : "Salvar layout"}</button>
        <button type="button" onClick={() => void restaurarLayout()}>Restaurar padrão</button>
      </div>
    </div>}
    <section aria-label="Dashboard personalizável" className="dashboard-layout">
      <div className="dashboard-grid" onDragOver={(event) => { if (editMode) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
        onDrop={editMode ? soltarWidget : undefined}>
        {todos.filter((card) => editMode || layout.widgets[card.id].visible)
          .sort((a, b) => layout.widgets[a.id].y - layout.widgets[b.id].y || layout.widgets[a.id].x - layout.widgets[b.id].x)
          .map((card) => <Cartao key={card.id} card={card} disponivel={Boolean(dash)} onClick={() => setSelecionado(card.id)}
            editando={editMode} layout={layout.widgets[card.id]} onResize={(w, h) => redimensionar(card.id, w, h)}
            onToggleVisibility={() => alternarVisibilidade(card.id)} onDragStart={setArrastado} />)}
        {(editMode || layout.widgets.grafico.visible) && <WidgetFrame id="grafico" layout={layout.widgets.grafico} editando={editMode}
          onToggleVisibility={() => alternarVisibilidade("grafico")} onResize={(w, h) => redimensionar("grafico", w, h)} onDragStart={setArrastado}>
          <Grafico dias={diasGrafico} periodo={periodo} loading={loading} />
        </WidgetFrame>}
        {(editMode || layout.widgets.ranking.visible) && <WidgetFrame id="ranking" layout={layout.widgets.ranking} editando={editMode}
          onToggleVisibility={() => alternarVisibilidade("ranking")} onResize={(w, h) => redimensionar("ranking", w, h)} onDragStart={setArrastado}>
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
        </WidgetFrame>}
      </div>
    </section>
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
