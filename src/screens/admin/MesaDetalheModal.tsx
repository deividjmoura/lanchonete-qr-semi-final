import { Copy, MapPin, Receipt, UserSwitch, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Btn, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import { mesaClienteUrl } from "../../lib/mesaUrl";
import {
  FAIXAS_PADRAO,
  FAIXAS_TEMPO,
  STATUS_ITEM,
  faixaOcupacao,
  formatarDuracao,
  formatarHora,
  type MesaDetalhe,
  type Praca,
} from "../../lib/panorama";
import { BRL } from "../../lib/utils";
import { usePub } from "../../store/usePub";
import { cn } from "../../utils/cn";
import { QrDownloadButton } from "./QrDownloadButton";

const STATUS_PEDIDO: Record<string, { rotulo: string; classe: string }> = {
  recebido: { rotulo: "Na fila", classe: "border-status-warning-border bg-status-warning-surface text-status-warning-ink" },
  em_producao: { rotulo: "Em produção", classe: "border-status-info-border bg-status-info-surface text-status-info-ink" },
  concluido: { rotulo: "Pronto", classe: "border-status-success-border bg-status-success-surface text-status-success-ink" },
  entregue: { rotulo: "Entregue", classe: "border-line bg-surface-sunken text-text-muted" },
  cancelado: { rotulo: "Cancelado", classe: "border-status-danger-border bg-status-danger-surface text-status-danger-ink" },
};

type Garcom = { id: number; nome: string };

type Props = {
  numero: number | null;
  pracas: Praca[];
  garcons: Garcom[];
  agora: number;
  onClose: () => void;
  onAlterado: () => void;
  onErro: (mensagem: string | null) => void;
};

export function MesaDetalheModal({ numero, pracas, garcons, agora, onClose, onAlterado, onErro }: Props) {
  const [detalhe, setDetalhe] = useState<MesaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pracaSelecionada, setPracaSelecionada] = useState<number | null>(null);
  const [salvandoPraca, setSalvandoPraca] = useState(false);
  const [destino, setDestino] = useState("");
  const [transferindo, setTransferindo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [liberando, setLiberando] = useState(false);
  const fecharSessao = usePub((s) => s.fecharSessao);

  const carregar = useMemo(
    () => async (numeroMesa: number) => {
      const dados = await api.adminMesaDetalhe(numeroMesa);
      setDetalhe(dados);
      setPracaSelecionada(dados.pracaId);
    },
    [],
  );

  useEffect(() => {
    if (numero == null) {
      setDetalhe(null);
      setErro(null);
      setDestino("");
      return;
    }
    let vivo = true;
    setCarregando(true);
    setErro(null);
    setDestino("");
    setCopiado(false);
    setLiberando(false);
    carregar(numero)
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível carregar a mesa");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [numero, carregar]);

  const ocupada = Boolean(detalhe?.sessaoId);
  const faixas = detalhe?.faixas || FAIXAS_PADRAO;
  const tempo = detalhe?.abertaEm ? faixaOcupacao(detalhe.abertaEm, agora, faixas) : null;
  const faixa = tempo ? FAIXAS_TEMPO[tempo.id] : null;

  const salvarPraca = async () => {
    if (!numero) return;
    setSalvandoPraca(true);
    setErro(null);
    try {
      await api.adminDefinirPracaMesa(numero, pracaSelecionada);
      await carregar(numero);
      onAlterado();
      onErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar a praça");
    } finally {
      setSalvandoPraca(false);
    }
  };

  const transferir = async () => {
    if (!numero || !detalhe) return;
    const destinoId = Number(destino);
    if (!destinoId) return;
    const nome = garcons.find((g) => g.id === destinoId)?.nome || "garçom";
    if (
      !confirm(
        `Transferir a responsabilidade da mesa ${numero} para ${nome}? Retiradas já assumidas continuam com seus garçons.`,
      )
    ) {
      return;
    }
    setTransferindo(true);
    setErro(null);
    try {
      await api.transferirMesaAdmin(numero, destinoId);
      await carregar(numero);
      setDestino("");
      onAlterado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao transferir mesa");
    } finally {
      setTransferindo(false);
    }
  };

  const copiarLink = async () => {
    if (!detalhe) return;
    const url = mesaClienteUrl(detalhe.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      prompt("Copie o link da mesa:", url);
    }
  };

  const liberar = () => {
    if (!detalhe?.sessaoId || liberando) return;
    // Mesma operação da tela anterior: fecha a sessão em dinheiro pelo store,
    // que avisa o operador em caso de erro e hidrata as mesas.
    setLiberando(true);
    fecharSessao(detalhe.sessaoId, "dinheiro");
    setTimeout(() => {
      setLiberando(false);
      onAlterado();
      onClose();
    }, 1200);
  };

  return (
    <Modal open={numero != null} onClose={onClose} wide>
      <div className="p-5 pr-16 sm:p-6 sm:pr-16">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Detalhe da mesa</p>
          <h3 className="mt-1 font-display text-2xl font-bold tracking-tight text-text">
            Mesa {String(numero ?? "").padStart(2, "0")}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={ocupada ? "brass" : "sage"} dot>
              {ocupada ? "Ocupada" : "Livre"}
            </Badge>
            <span className="rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold text-text-muted">
              {detalhe?.pracaNome || "Sem praça"}
            </span>
            {faixa && (
              <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold", faixa.classe)}>
                {formatarDuracao(tempo?.minutos)} · {faixa.rotulo}
              </span>
            )}
          </div>
        </header>

        {erro && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs text-status-danger-ink">
            <WarningCircle size={15} weight="fill" className="mt-0.5 shrink-0" /> {erro}
          </p>
        )}

        {carregando && !detalhe ? (
          <p className="mt-6 text-sm text-text-muted">Carregando dados da mesa…</p>
        ) : detalhe ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-sm border border-line bg-surface-sunken p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Sessão</p>
                <dl className="mt-1.5 space-y-1 text-xs">
                  <Linha rotulo="Aberta" valor={formatarHora(detalhe.abertaEm)} />
                  <Linha rotulo="Garçom" valor={detalhe.garcomResponsavelNome || "a definir"} />
                  <Linha rotulo="Cliente" valor={detalhe.clienteNome || "—"} />
                  <Linha
                    rotulo="Pedidos ativos"
                    valor={`${detalhe.pedidosAtivos}${detalhe.itensProntosRetirada > 0 ? ` · ${detalhe.itensProntosRetirada} item(ns) p/ retirada` : ""}`}
                  />
                </dl>
              </div>

              <div className="rounded-sm border border-line bg-surface-sunken p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Financeiro da sessão</p>
                <dl className="mt-1.5 space-y-1 text-xs">
                  <Linha rotulo="Consumo entregue" valor={BRL(detalhe.consumo)} />
                  <Linha rotulo="Já pago (parcial)" valor={BRL(detalhe.pago)} />
                  <Linha rotulo="Consumo em aberto" valor={BRL(detalhe.saldo)} destaque />
                </dl>
                <p className="mt-1.5 text-[10px] leading-relaxed text-text-subtle">
                  Consumo em aberto é o entregue ainda não pago. Só contas fechadas entram em vendas: isto não é
                  receita recebida.
                </p>
              </div>
            </div>

            <section className="rounded-sm border border-line bg-surface-sunken p-3">
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                <MapPin size={13} weight="bold" /> Praça da mesa
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-[11px] text-text-muted">
                  Classificação interna
                  <select
                    aria-label={`Praça da mesa ${numero}`}
                    value={pracaSelecionada == null ? "" : String(pracaSelecionada)}
                    onChange={(e) => setPracaSelecionada(e.target.value ? Number(e.target.value) : null)}
                    className="mt-1 h-10 w-full rounded-sm border border-line-strong bg-surface-raised px-2.5 text-xs text-text"
                  >
                    <option value="">Sem praça</option>
                    {pracas.map((praca) => (
                      <option key={praca.id} value={praca.id}>
                        {praca.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <Btn
                  size="sm"
                  variant="outline"
                  disabled={salvandoPraca || pracaSelecionada === detalhe.pracaId}
                  onClick={() => void salvarPraca()}
                >
                  {salvandoPraca ? "Salvando…" : "Salvar praça"}
                </Btn>
              </div>
              <p className="mt-1.5 text-[10px] text-text-subtle">
                Os nomes das praças ficam no banco e podem ser alterados no panorama.
              </p>
            </section>

            {ocupada && (
              <section className="rounded-sm border border-line bg-surface-sunken p-3">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  <UserSwitch size={13} weight="bold" /> Transferir responsabilidade
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-[11px] text-text-muted">
                    Novo garçom responsável
                    <select
                      aria-label={`Transferir mesa ${numero} para garçom`}
                      value={destino}
                      onChange={(e) => setDestino(e.target.value)}
                      className="mt-1 h-10 w-full rounded-sm border border-line-strong bg-surface-raised px-2.5 text-xs text-text"
                    >
                      <option value="">Selecione…</option>
                      {garcons
                        .filter((g) => g.id !== detalhe.garcomResponsavelId)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.nome}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={transferindo || !destino}
                    onClick={() => void transferir()}
                  >
                    {transferindo ? "Transferindo…" : "Transferir"}
                  </Btn>
                </div>
                <p className="mt-1.5 text-[10px] text-text-subtle">
                  Retiradas já assumidas continuam com seus garçons.
                </p>
              </section>
            )}

            <section>
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                <Receipt size={13} weight="bold" /> Pedidos da sessão
              </p>
              {detalhe.pedidos.length === 0 ? (
                <p className="mt-2 rounded-sm border border-dashed border-line-strong bg-surface-sunken p-4 text-center text-xs text-text-muted">
                  Nenhum pedido lançado nesta sessão.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detalhe.pedidos.map((pedido) => {
                    const status = STATUS_PEDIDO[pedido.status] || STATUS_PEDIDO.recebido;
                    return (
                      <li key={pedido.id} className="rounded-sm border border-line bg-surface-sunken p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-mono text-[11px] font-bold text-text">
                            #{pedido.id}
                            {pedido.criadoEm && (
                              <span className="ml-1.5 font-sans font-normal text-text-muted">
                                {formatarHora(pedido.criadoEm)}
                              </span>
                            )}
                          </p>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", status.classe)}>
                            {status.rotulo}
                          </span>
                        </div>
                        <ul className="mt-1.5 space-y-0.5">
                          {pedido.itens.map((item) => (
                            <li key={item.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                              <span className={cn("min-w-0 truncate", item.status === "cancelado" && "line-through opacity-60")}>
                                <strong className="mr-1 font-mono text-brand-ink">{item.quantidade}×</strong>
                                {item.nome}
                                <span className="ml-1 text-[10px] uppercase tracking-wider text-text-subtle">
                                  {item.setor}
                                </span>
                              </span>
                              <span className="shrink-0 text-text-muted">{STATUS_ITEM[item.status] || item.status}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {detalhe.pagamentos.length > 0 && (
              <section>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Pagamentos parciais</p>
                <ul className="mt-1.5 space-y-1">
                  {detalhe.pagamentos.map((pagamento) => (
                    <li key={pagamento.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="text-text-muted">
                        {pagamento.forma || "forma não informada"}
                        {pagamento.criadoEm && ` · ${formatarHora(pagamento.criadoEm)}`}
                      </span>
                      <strong className="font-mono text-text">{BRL(pagamento.valor)}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Btn size="sm" variant="outline" onClick={() => void copiarLink()}>
                <Copy size={15} /> {copiado ? "Link copiado" : "Copiar link"}
              </Btn>
              <QrDownloadButton
                numero={detalhe.numero}
                token={detalhe.token}
                className="size-auto min-h-10 px-3 text-xs font-semibold gap-1.5"
              >
                <span className="inline-flex items-center gap-1.5">QR em SVG</span>
              </QrDownloadButton>
              {ocupada && (
                <Btn
                  size="sm"
                  variant="danger"
                  onClick={liberar}
                  disabled={liberando}
                  className="ml-auto"
                >
                  {liberando ? "Liberando…" : "Liberar mesa"}
                </Btn>
              )}
            </footer>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-muted">{rotulo}</dt>
      <dd className={cn("min-w-0 text-right font-mono text-[11px] text-text", destaque && "font-bold text-status-warning-ink")}>
        {valor}
      </dd>
    </div>
  );
}
