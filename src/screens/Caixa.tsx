import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowsSplit,
  CashRegister,
  Check,
  Clock,
  Copy,
  CreditCard,
  HandCoins,
  Minus,
  Money,
  Plus,
  QrCode,
  Receipt,
  Users,
  X,
} from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { OpsShell, useAnuncios } from "../components/OpsShell";
import { Badge, Btn } from "../components/ui";
import { ir, useAgora } from "../router";
import type { FormaPagamento, PixConfig, Sessao } from "../lib/types";
import { FORMAS, consumoSessao, pagoSessao, usePub } from "../store/usePub";
import { api } from "../lib/api";
import { QR_SVG_COLORS } from "../lib/tema";
import { BRL, elapsed, montarPixEMV } from "../lib/utils";
import { cn } from "../utils/cn";

export default function Caixa() {
  const auth = usePub((s) => s.auth);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!auth) {
      ir("/login");
      return;
    }
    if (auth.role !== "admin" && auth.role !== "caixa") {
      ir(auth.role === "cozinha" ? "/cozinha" : "/login");
    }
  }, [auth]);

  useAnuncios("caixa");
  useAgora(1000);

  const sessoes = usePub((s) => s.sessoes);
  const lastError = usePub((s) => s.lastError);
  const hydrateCaixa = usePub((s) => s.hydrateCaixa);

  useEffect(() => {
    void hydrateCaixa();
    const t = setInterval(() => void hydrateCaixa(), 10000);
    return () => clearInterval(t);
  }, [hydrateCaixa]);

  const pedidos = usePub((s) => s.pedidos);
  const [selId, setSelId] = useState<number | null>(null);
  const abertas = sessoes.filter((s) => s.status === "aberta");
  const selecionada = abertas.find((s) => s.id === selId) || abertas[0] || null;

  const totalSalao = abertas.reduce((a, s) => {
    // #153: sem ajuste manual (taxa 0), vale o serviço sugerido pelo backend.
    const servicoLista = s.taxa > 0 ? s.taxa : (s.taxaServicoSugerida ?? 0);
    const bruto = consumoSessao(s, pedidos) - s.desconto + servicoLista;
    const pago = s.valorPago != null ? s.valorPago : pagoSessao(s);
    return a + Math.max(0, bruto - pago);
  }, 0);

  const extras = (
    <div className="flex items-center gap-1.5">
      <Badge tone="brass">{abertas.length} abertas</Badge>
      <Badge tone="sage">A receber · {BRL(Math.max(0, totalSalao))}</Badge>
    </div>
  );

  return (
    <OpsShell
      ativo="caixa"
      regime="operational"
      kicker="Operação · Caixa"
      titulo="Fechamento de contas"
      extra={extras}
      subhead={
        lastError ? (
          <p
            role="alert"
            className="rounded-sm border border-status-danger-border bg-status-danger-surface px-3.5 py-2.5 text-xs font-semibold text-status-danger-ink"
          >
            {lastError}
          </p>
        ) : undefined
      }
    >
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Lista de comandas abertas */}
        <section className="lg:col-span-5 xl:col-span-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-line">
            <h2 className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              <Receipt size={15} className="text-brand-ink" /> Comandas abertas
            </h2>
            <span className="font-mono text-[11px] text-text-muted">{abertas.length}</span>
          </div>

          {abertas.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong bg-surface-raised py-14 px-5 text-center">
              <CashRegister size={32} className="text-text-muted mx-auto" />
              <p className="mt-3 font-display text-lg font-bold tracking-tight text-text">
                Nenhuma comanda aberta
              </p>
              <p className="mt-1 text-xs text-text-muted">
                As mesas aparecem automaticamente assim que entram pedidos.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {abertas.map((s) => {
                const consumoBruto = consumoSessao(s, pedidos);
                const servicoLista = s.taxa > 0 ? s.taxa : (s.taxaServicoSugerida ?? 0);
                const consumo = consumoBruto - s.desconto + servicoLista;
                const pago = s.valorPago != null ? s.valorPago : pagoSessao(s);
                const falta = Math.max(0, consumo - pago);
                const pct = consumo > 0 ? Math.min(100, (pago / consumo) * 100) : 0;
                const ativo = selecionada?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setSelId(s.id)}
                    className={cn(
                      "w-full text-left rounded-md p-4 border transition-colors duration-150",
                      ativo
                        ? "bg-surface-raised border-brand"
                        : "bg-surface-raised border-line hover:border-line-strong hover:bg-surface-hover",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-2xl font-bold tracking-tight text-text leading-tight">
                        {s.mesaNome}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {s.pixAvisos > 0 && <Badge tone="brass">PIX {s.pixAvisos}×</Badge>}
                        <Badge tone="neutral">
                          <Clock size={12} /> {elapsed(s.abertaEm)}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-dashed border-line flex items-end justify-between">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                          Consumo
                        </p>
                        <p className="font-mono text-base font-bold text-text">{BRL(consumo)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                          Restante
                        </p>
                        <p
                          className={cn(
                            "font-mono text-base font-bold",
                            falta <= 0.005 ? "text-status-success-ink" : "text-accent-ink",
                          )}
                        >
                          {BRL(falta)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2.5 h-1.5 rounded-xs bg-surface-sunken overflow-hidden">
                      <div
                        className="h-full w-full origin-left bg-status-success transition-transform duration-150"
                        style={{ transform: `scaleX(${Math.max(0, Math.min(1, pct / 100))})` }}
                      />
                    </div>
                    <p className="mt-1.5 font-mono text-[10px] text-text-muted">
                      Pago {BRL(pago)} · {pct.toFixed(0)}%
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Detalhe da comanda selecionada */}
        <section className="lg:col-span-7 xl:col-span-8">
          <AnimatePresence mode="wait">
            {selecionada ? (
              <motion.div
                key={selecionada.id}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
              >
                <DetalheCaixa sessao={selecionada} />
              </motion.div>
            ) : (
              <div className="grid place-items-center rounded-md border border-dashed border-line-strong bg-surface-raised py-20 px-6 text-center">
                <div>
                  <CashRegister size={40} className="text-text-muted mx-auto" />
                  <h3 className="font-display text-3xl font-bold tracking-tight text-text mt-3">
                    Caixa livre
                  </h3>
                  <p className="text-sm text-text-muted mt-1">
                    Selecione uma comanda aberta para dividir, conferir PIX ou encerrar a mesa.
                  </p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </section>
      </div>

    </OpsShell>
  );
}

/* =================== DETALHE DA COMANDA (SEM CARTÕES ANINHADOS) =================== */
function DetalheCaixa({ sessao }: { sessao: Sessao }) {
  const auth = usePub((s) => s.auth);
  const hydrateCaixa = usePub((s) => s.hydrateCaixa);
  const reportarErro = usePub((s) => s.reportarErro);

  const cancelarItem = async (itemId: number) => {
    const motivo = prompt("Motivo do cancelamento do item (mínimo 3 caracteres):");
    if (motivo == null) return;
    try {
      await api.cancelarItem(itemId, motivo, auth?.role === "admin" ? "admin" : "caixa");
      await hydrateCaixa();
    } catch (e) {
      reportarErro(e instanceof Error ? e.message : "Falha ao cancelar item");
    }
  };

  const pedidos = usePub((s) => s.pedidos).filter((p) => p.sessaoId === sessao.id);
  const registrar = usePub((s) => s.registrarPagamento);
  const setDesconto = usePub((s) => s.setDesconto);
  const setTaxa = usePub((s) => s.setTaxa);
  const fecharSessao = usePub((s) => s.fecharSessao);

  const allPedidos = usePub((s) => s.pedidos);
  const consumo = consumoSessao(sessao, allPedidos);
  // Serviço (#153): padrão do backend sobre o consumo bruto. Enquanto o
  // operador não mexer no campo, exibimos o sugerido e o fechamento omite
  // a taxa (backend aplica o padrão); se mexer, vira ajuste com motivo.
  const percentualServico = sessao.taxaServicoPercentual ?? 10;
  const servicoSugerido = Math.round(((consumo * percentualServico) / 100) * 100) / 100;
  const [servicoTocado, setServicoTocado] = useState(false);
  const [motivoServico, setMotivoServico] = useState("");
  const servico = servicoTocado ? sessao.taxa : servicoSugerido;
  const servicoAjustado = servicoTocado && Math.abs(servico - servicoSugerido) > 0.005;
  const total = Math.max(0, consumo - sessao.desconto + servico);
  const pago = sessao.valorPago != null ? Number(sessao.valorPago) : pagoSessao(sessao);
  const restante = Math.max(0, Math.round((total - pago) * 100) / 100);

  const semPendencias =
    sessao.podeFechar !== false &&
    !(sessao.pedidosPendentes != null && sessao.pedidosPendentes > 0);
  const podeEncerrar = semPendencias && (total > 0 || (sessao.pedidosCancelados ?? 0) > 0);

  const [pessoas, setPessoas] = useState(2);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<FormaPagamento>("pix");
  const [copiado, setCopiado] = useState(false);
  const [fechando, setFechando] = useState(false);

  useEffect(() => {
    setValor("");
    setFechando(false);
    setServicoTocado(false);
    setMotivoServico("");
  }, [sessao.id]);

  const [pixCfg, setPixCfg] = useState<PixConfig | null>(null);
  const [pixAviso, setPixAviso] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .configPix()
      .then((c) => {
        if (!alive) return;
        if (c?.chave) setPixCfg({ chave: c.chave, nome: c.nome, cidade: c.cidade });
        if (c && c.chaveValida === false)
          setPixAviso(c.aviso || "Confira PIX_CHAVE no servidor");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const pixCodigo = useMemo(() => {
    if (!pixCfg?.chave) return "";
    return montarPixEMV({
      chave: pixCfg.chave,
      nome: pixCfg.nome || "RECEBEDOR",
      cidade: pixCfg.cidade || "BRASIL",
      valor: Number(valor) > 0.005 ? Number(valor) : restante > 0.005 ? restante : total,
      txid: `S${sessao.id}P${sessao.pagamentos.length + 1}`,
    });
  }, [pixCfg, valor, restante, total, sessao.id, sessao.pagamentos.length]);

  const usarPorPessoa = () => {
    if (pessoas > 0) setValor((restante / pessoas).toFixed(2));
  };

  const podeRegistrar = Number(valor) > 0.004 && Number(valor) <= restante + 0.01;

  const fechar = () => {
    if (servicoAjustado && motivoServico.trim().length < 3) {
      reportarErro("Informe o motivo para remover ou ajustar o serviço antes de fechar.");
      return;
    }
    fecharSessao(sessao.id, forma, { taxaServicoMotivo: motivoServico.trim() || undefined });
    setFechando(false);
  };

  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCodigo);
    } catch {
      /* ok */
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  };

  return (
    <div className="rounded-md border border-line bg-surface-raised overflow-hidden">
      {/* Cabeçalho da comanda */}
      <div className="px-5 sm:px-6 py-4 border-b border-dashed border-line-strong bg-surface-sunken flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-ink">
            Comanda #{sessao.id}
          </p>
          <h2 className="font-display text-4xl font-bold tracking-tight text-text leading-tight mt-1">
            {sessao.mesaNome}
          </h2>
          {sessao.clienteNome && (
            <p className="text-xs text-text-muted mt-1 font-semibold">{sessao.clienteNome}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Tempo aberta
          </p>
          <p className="font-mono text-sm font-bold text-text">{elapsed(sessao.abertaEm)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line">
        {/* Coluna 1: Itens + Ajustes + Resumo em lista contínua */}
        <div className="p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-3">
              Consumo lançado
            </h3>
            <div className="divide-y divide-dashed divide-line max-h-72 overflow-y-auto pr-1 no-scrollbar border-y border-dashed border-line">
              {pedidos.map((p) => (
                <div key={p.id} className="py-3">
                  <p className="font-mono text-[11px] font-semibold text-text-muted mb-1.5">
                    #{p.id} {p.clienteNome ? `· ${p.clienteNome}` : ""}
                  </p>
                  {p.itens.map((i) => (
                    <div
                      key={i.id}
                      className="flex justify-between gap-3 text-xs text-text py-1"
                    >
                      <span
                        className={cn(
                          "leading-snug",
                          i.status === "cancelado" && "line-through opacity-50",
                        )}
                      >
                        <strong className="font-mono text-brand-ink">{i.qtd}×</strong> {i.nome}
                        {i.escolha && (
                          <span className="text-text-muted text-[11px]"> · {i.escolha.nome}</span>
                        )}
                        {i.status && (
                          <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                            {i.status === "concluido"
                              ? "pronto"
                              : i.status === "em_producao"
                                ? "preparando"
                                : i.status === "aceito"
                                  ? "aceito"
                                  : i.status === "retirado"
                                    ? "retirado"
                                    : i.status === "entregue"
                                      ? "entregue"
                                      : i.status === "cancelado"
                                        ? "cancelado"
                                        : "na fila"}
                          </span>
                        )}
                        {i.status && i.status !== "entregue" && i.status !== "cancelado" && (
                          <button
                            type="button"
                            className="ml-2 font-mono text-[10px] font-bold text-status-danger-ink hover:underline"
                            onClick={() => void cancelarItem(Number(i.id))}
                          >
                            Cancelar item
                          </button>
                        )}
                      </span>
                      <span className="font-mono text-xs text-text shrink-0">
                        {BRL(i.totalUnit * i.qtd)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {pedidos.length === 0 && (
                <p className="py-6 text-xs text-text-muted text-center">Sem pedidos registrados</p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Ajuste
                label="Desconto"
                valor={sessao.desconto}
                onChange={(v) => setDesconto(sessao.id, v)}
                tom="text-status-success-ink"
              />
              <Ajuste
                label={`Serviço (${percentualServico}%)`}
                valor={servico}
                onChange={(v) => {
                  setServicoTocado(true);
                  setTaxa(sessao.id, v);
                }}
                tom="text-accent-ink"
              />
            </div>
            {servicoAjustado && (
              <label className="mt-3 block font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Motivo do ajuste do serviço (obrigatório)
                <input
                  type="text"
                  value={motivoServico}
                  onChange={(e) => setMotivoServico(e.target.value)}
                  placeholder="Ex.: cliente pediu para remover o serviço"
                  className="mt-1.5 block h-10 w-full rounded-sm bg-surface-sunken border border-line-strong px-3 text-xs normal-case tracking-normal text-text focus:outline-none focus:border-brand"
                />
              </label>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-dashed border-line-strong space-y-1.5 font-mono text-xs">
            <Linha label="Consumo" valor={BRL(consumo)} />
            <Linha
              label="Desconto"
              valor={`− ${BRL(sessao.desconto)}`}
              tom="text-status-success-ink"
            />
            <Linha label={`Serviço (${percentualServico}%)`} valor={`+ ${BRL(servico)}`} tom="text-accent-ink" />
            <div className="border-t border-line pt-2.5 mt-2 flex justify-between items-baseline">
              <span className="text-text-muted text-xs uppercase tracking-wider font-sans font-bold">
                Total da comanda
              </span>
              <span className="font-mono text-3xl font-extrabold text-text">{BRL(total)}</span>
            </div>
          </div>
        </div>

        {/* Coluna 2: Divisão + Recebimento + PIX + Fechamento */}
        <div className="p-5 sm:p-6 space-y-4">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted flex items-center gap-1.5">
            <HandCoins size={15} className="text-status-success-ink" /> Recebimento
          </h3>

          {/* Divisão */}
          <div className="pb-4 border-b border-dashed border-line-strong space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-text">
                <Users size={16} className="text-text-muted" /> Dividir conta
              </p>
              <div className="inline-flex items-center rounded-sm border border-line-strong bg-surface-sunken">
                <button
                  type="button"
                  aria-label="Menos uma pessoa"
                  onClick={() => setPessoas((p) => Math.max(1, p - 1))}
                  className="size-10 grid place-items-center text-text-muted hover:text-text"
                >
                  <Minus size={14} weight="bold" />
                </button>
                <span className="w-10 text-center font-mono text-base font-bold text-text border-x border-line">
                  {pessoas}
                </span>
                <button
                  type="button"
                  aria-label="Mais uma pessoa"
                  onClick={() => setPessoas((p) => Math.min(20, p + 1))}
                  className="size-10 grid place-items-center text-text-muted hover:text-text"
                >
                  <Plus size={14} weight="bold" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={usarPorPessoa}
              className="w-full min-h-11 rounded-sm border border-line-strong bg-surface-sunken text-text font-mono text-xs font-semibold uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:bg-surface-hover transition-colors"
            >
              <ArrowsSplit size={15} /> Usar valor/pessoa ·{" "}
              {pessoas > 0 ? BRL(restante / pessoas) : "—"}
            </button>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-text-muted">
                  R$
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full h-12 rounded-sm bg-surface-sunken border border-line-strong pl-10 pr-3 font-mono text-base text-text focus:outline-none focus:border-brand"
                />
              </div>
              <button
                type="button"
                onClick={() => setValor(restante.toFixed(2))}
                className="h-12 px-3.5 rounded-sm bg-surface-sunken border border-line-strong font-mono text-xs font-bold uppercase tracking-wider text-text hover:bg-surface-hover"
              >
                Tudo
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {FORMAS.map((f) => {
                const selecionadaForma = forma === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={selecionadaForma}
                    onClick={() => setForma(f.id)}
                    className={cn(
                      "min-h-12 rounded-sm font-mono text-[11px] font-bold uppercase tracking-wide border transition-colors inline-flex items-center justify-center gap-1.5",
                      selecionadaForma
                        ? "bg-brand text-brand-contrast border-brand"
                        : "bg-surface-sunken border-line text-text-muted hover:text-text hover:border-line-strong",
                    )}
                  >
                    {f.id === "pix" ? (
                      <QrCode size={14} weight={selecionadaForma ? "fill" : "regular"} />
                    ) : f.id === "dinheiro" ? (
                      <Money size={14} weight={selecionadaForma ? "fill" : "regular"} />
                    ) : (
                      <CreditCard size={14} weight={selecionadaForma ? "fill" : "regular"} />
                    )}
                    {f.label}
                  </button>
                );
              })}
            </div>

            <Btn
              full
              onClick={() => podeRegistrar && registrar(sessao.id, Number(valor), forma)}
              disabled={!podeRegistrar}
            >
              Registrar pagamento
            </Btn>
          </div>

          {/* Pagamentos já lançados */}
          <div>
            <p className="flex items-center justify-between font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted mb-2">
              <span>Pagamentos lançados</span>
              <span className="text-text font-bold">Resta {BRL(restante)}</span>
            </p>
            <div className="divide-y divide-line max-h-28 overflow-y-auto pr-1 no-scrollbar border-y border-line">
              {sessao.pagamentos.length === 0 && (
                <p className="py-3 text-center text-xs text-text-muted">Nenhum pagamento registrado</p>
              )}
              {sessao.pagamentos.map((pg) => (
                <div key={pg.id} className="flex items-center justify-between py-2">
                  <span className="flex min-w-0 flex-col gap-0.5 text-xs font-semibold text-status-success-ink">
                    <span className="flex items-center gap-1.5 font-mono uppercase">
                      <Check size={13} weight="bold" className="shrink-0" />
                      {FORMAS.find((f) => f.id === pg.forma)?.label}
                    </span>
                    {pg.operadorNome && (
                      <span className="pl-5 text-[11px] font-normal text-text-muted">
                        registrado por {pg.operadorNome}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-xs font-bold text-status-success-ink shrink-0">
                    {BRL(pg.valor)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Instrução da forma escolhida; PIX mostra QR dinâmico */}
          {forma === "pix" ? (
            <div className="rounded-sm border border-brand-border bg-brand-surface p-3.5">
              <div className="flex items-center gap-3.5">
                <div className="qr-quiet-zone shrink-0">
                  {pixCodigo ? (
                    <QRCodeSVG
                      value={pixCodigo}
                      size={92}
                      fgColor={QR_SVG_COLORS.fg}
                      bgColor={QR_SVG_COLORS.bg}
                      level="M"
                    />
                  ) : (
                    <div className="size-[92px] flex items-center justify-center text-[10px] text-text-muted text-center px-1">
                      Configure PIX_CHAVE no servidor
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-text">
                    PIX · {BRL(Number(valor) > 0.005 ? Number(valor) : restante)}
                  </p>
                  {pixAviso ? (
                    <p className="text-xs font-semibold text-status-warning-ink leading-snug mt-1">
                      {pixAviso}
                    </p>
                  ) : (
                    <p className="text-xs text-text-muted leading-snug mt-1">
                      O QR acompanha o valor informado. Confira o recebimento no banco antes de registrar.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void copiarPix()}
                    disabled={!pixCodigo}
                    className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs font-bold text-brand-ink hover:underline disabled:opacity-40"
                  >
                    {copiado ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                    {copiado ? "Copiado!" : "Copiar código PIX"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-sm border border-line bg-surface-sunken p-3 text-xs text-text-muted">
              Forma selecionada:{" "}
              <strong className="text-text">{FORMAS.find((f) => f.id === forma)?.label}</strong>.
              Confirme na maquininha ou na gaveta antes de registrar {BRL(Number(valor) || 0)}.
            </div>
          )}

          {/* Fechamento da conta */}
          <div className="pt-1">
            {sessao.pedidosPendentes != null && sessao.pedidosPendentes > 0 && (
              <p className="mb-2 text-center text-xs text-brand-ink font-medium">
                {sessao.pedidosPendentes} pedido(s) em preparo/entrega — encerre somente após entrega ou cancelamento.
              </p>
            )}
            {!fechando ? (
              <Btn
                full
                size="lg"
                variant="sage"
                onClick={() => setFechando(true)}
                disabled={!podeEncerrar}
              >
                {total <= 0 ? (
                  "Encerrar comanda sem consumo"
                ) : (
                  <>
                    Fechar conta{" "}
                    {restante > 0.004 ? `· quita ${BRL(restante)}` : "· já quitada"}
                  </>
                )}
              </Btn>
            ) : (
              <div className="rounded-sm border border-status-success-border bg-status-success-surface p-3.5">
                <p className="text-sm font-bold text-text">Fechar {sessao.mesaNome}?</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {restante > 0.004
                    ? `O restante (${BRL(restante)}) será registrado em ${FORMAS.find((f) => f.id === forma)?.label} e a mesa será liberada.`
                    : "Conta quitada — a mesa será liberada imediatamente."}
                </p>
                <div className="mt-3 flex gap-2">
                  <Btn full variant="sage" onClick={fechar}>
                    <Check size={16} weight="bold" /> Confirmar fechamento
                  </Btn>
                  <Btn variant="secondary" onClick={() => setFechando(false)}>
                    <X size={16} weight="bold" />
                  </Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Ajuste({
  label,
  valor,
  onChange,
  tom,
}: {
  label: string;
  valor: number;
  onChange: (v: number) => void;
  tom: string;
}) {
  const [txt, setTxt] = useState(valor ? String(valor) : "");
  useEffect(() => setTxt(valor ? String(valor) : ""), [valor]);
  const aplicar = (d: number) => {
    const novo = Math.max(0, Math.round((valor + d) * 100) / 100);
    onChange(novo);
  };
  return (
    <div>
      <p className={cn("font-mono text-[10px] font-bold uppercase tracking-wider mb-1.5", tom)}>
        {label}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Diminuir ${label}`}
          onClick={() => aplicar(-1)}
          className="grid place-items-center size-10 rounded-sm bg-surface-sunken border border-line-strong text-text-muted hover:text-text"
        >
          <Minus size={14} weight="bold" />
        </button>
        <input
          type="number"
          value={txt}
          onChange={(e) => {
            setTxt(e.target.value);
            const n = Number(e.target.value);
            if (!Number.isNaN(n) && n >= 0) onChange(n);
          }}
          className="w-full h-10 rounded-sm bg-surface-sunken border border-line-strong text-center font-mono text-sm text-text focus:outline-none focus:border-brand"
        />
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          onClick={() => aplicar(1)}
          className="grid place-items-center size-10 rounded-sm bg-surface-sunken border border-line-strong text-text-muted hover:text-text"
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function Linha({ label, valor, tom }: { label: string; valor: string; tom?: string }) {
  return (
    <div className="flex justify-between text-text-muted">
      <span className="text-xs font-sans uppercase tracking-wider font-semibold">{label}</span>
      <span className={tom || "text-text"}>{valor}</span>
    </div>
  );
}
