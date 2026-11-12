import {
  ArrowsClockwise,
  CaretDown,
  CaretUp,
  CheckCircle,
  Clock,
  CookingPot,
  MagnifyingGlass,
  Receipt,
  User,
  Users,
  Wallet,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ControlesPaginacao, useLimiteLocal } from "../../components/Paginacao";
import { api } from "../../lib/api";
import {
  FAIXAS_PADRAO,
  FAIXAS_TEMPO,
  STATUS_ITEM,
  aguardandoPedidoDe,
  formatarDuracao,
  formatarHora,
  minutosDesde,
  tempoClassificado,
  tempoSessaoDe,
  type MesaDetalhe,
  type MesaPanorama,
  type PanoramaMesas,
} from "../../lib/panorama";
import { BRL } from "../../lib/utils";
import { useAgora } from "../../router";
import { cn } from "../../utils/cn";

/**
 * Mesas abertas do dashboard.
 *
 * Aberto pelo card “Mesas ocupadas”: cobre o painel e repete a linguagem
 * visual do dashboard (mesmos tons, tipografia e grade), mas com o detalhe de
 * cada mesa — quem pediu, quem está atendendo, o que já foi entregue e o que
 * está parado na produção.
 */

/** Situação da mesa calculada no cliente (igual à regra do backend). */
type TempoMesa = NonNullable<ReturnType<typeof tempoClassificado>>;
type Ordem = "tempo" | "numero" | "consumo";
type Situacao = "todas" | "atencao" | "critica";

const ORDENS: { id: Ordem; rotulo: string }[] = [
  { id: "tempo", rotulo: "Mais tempo aberta" },
  { id: "numero", rotulo: "Número da mesa" },
  { id: "consumo", rotulo: "Maior consumo" },
];
const SITUACOES: { id: Situacao; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "atencao", rotulo: "Em atenção" },
  { id: "critica", rotulo: "Críticas" },
];

/** Busca sem acento/maiúscula: “ana” encontra “Ana” e “Ângela”. */
function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function MesasAbertasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogo = useRef<HTMLDialogElement | null>(null);
  const agora = useAgora(15000);
  const [dados, setDados] = useState<PanoramaMesas | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("tempo");
  const [situacao, setSituacao] = useState<Situacao>("todas");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await api.adminMesasPanorama("hoje");
      if (!resposta || !Array.isArray(resposta.mesas)) {
        throw new Error("Resposta inesperada do servidor ao carregar as mesas.");
      }
      setDados(resposta);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as mesas abertas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void carregar();
    // Retrato vivo: o SSE do resto do painel não alcança este diálogo.
    const timer = window.setInterval(() => void carregar(), 20000);
    return () => window.clearInterval(timer);
  }, [open, carregar]);

  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  const faixas = dados?.config.faixas || FAIXAS_PADRAO;
  const todas = dados?.mesas || [];
  const comTempo = useMemo(
    () =>
      todas
        .filter((mesa) => Boolean(mesa.sessaoId))
        // #303: a faixa conta do primeiro pedido válido, não da abertura.
        .map((mesa) => ({
          mesa,
          tempo: tempoClassificado(mesa, agora, faixas),
          sessao: tempoSessaoDe(mesa, agora),
        })),
    [todas, agora, faixas],
  );

  const termo = normalizar(busca);
  const visiveis = useMemo(() => {
    const filtradas = comTempo.filter(({ mesa, tempo }) => {
      if (situacao === "critica" && tempo?.id !== "critica") return false;
      if (situacao === "atencao" && tempo?.id !== "atencao" && tempo?.id !== "critica") return false;
      if (!termo) return true;
      return [
        String(mesa.numero),
        String(mesa.numero).padStart(2, "0"),
        mesa.clienteNome || "",
        mesa.garcomResponsavelNome || "",
        mesa.pracaNome || "",
      ]
        .map(normalizar)
        .some((campo) => campo.includes(termo));
    });
    const ordenadas = filtradas.slice();
    ordenadas.sort((a, b) => {
      if (ordem === "numero") return a.mesa.numero - b.mesa.numero;
      if (ordem === "consumo") return b.mesa.saldo - a.mesa.saldo || a.mesa.numero - b.mesa.numero;
      return (
        (b.sessao?.minutos ?? b.tempo?.minutos ?? 0) - (a.sessao?.minutos ?? a.tempo?.minutos ?? 0) ||
        a.mesa.numero - b.mesa.numero
      );
    });
    return ordenadas;
  }, [comTempo, termo, ordem, situacao]);

  const pagina = useLimiteLocal(visiveis, 12, `${ordem}|${situacao}|${termo}`);

  const totais = useMemo(() => {
    let saldo = 0;
    let pedidos = 0;
    let itensFila = 0;
    let atencao = 0;
    let criticas = 0;
    for (const { mesa, tempo } of comTempo) {
      saldo += Number(mesa.saldo || 0);
      pedidos += Number(mesa.pedidosAtivos || 0);
      itensFila += Number(mesa.itensNaFila || 0);
      if (tempo?.id === "atencao") atencao += 1;
      if (tempo?.id === "critica") criticas += 1;
    }
    return { saldo, pedidos, itensFila, atencao, criticas };
  }, [comTempo]);

  return (
    <dialog
      ref={dialogo}
      className="dash-dialog dash-dialog--full"
      aria-labelledby="dash-mesas-abertas-titulo"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dash-mesas">
        <header className="dash-mesas__head">
          <div className="dash-mesas__head-main">
            <p className="dash-kicker rotulo">
              Salão agora <span className="dash-eyebrow__sep">/</span> Mesas abertas
            </p>
            <h3 id="dash-mesas-abertas-titulo">Mesas ocupadas</h3>
            <p>
              {comTempo.length} {comTempo.length === 1 ? "mesa aberta" : "mesas abertas"} de {todas.length}{" "}
              habilitadas · quem pediu, quem está atendendo e o que falta entregar.
            </p>
          </div>
          <div className="dash-mesas__actions">
            <span className="dash-mesas__updated">
              {dados ? `Atualizado ${formatarHora(dados.atualizadoEm)}` : "—"}
            </span>
            <button
              type="button"
              className="dash-mesas__refresh"
              onClick={() => void carregar()}
              disabled={carregando}
              aria-label="Atualizar mesas abertas"
              title="Atualizar mesas abertas"
            >
              <ArrowsClockwise size={16} weight="bold" className={carregando ? "dash-girando" : undefined} />
              {carregando ? "Atualizando…" : "Atualizar"}
            </button>
            <button
              type="button"
              className="dash-dialog__close"
              onClick={onClose}
              aria-label="Fechar mesas abertas"
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="dash-mesas__body">
          <div className="dash-mesas__stats">
            <Indicador
              rotulo="Mesas abertas"
              valor={`${comTempo.length}/${todas.length}`}
              detalhe={`${totais.atencao} em atenção · ${totais.criticas} críticas`}
              icone={<Users size={17} weight="bold" />}
              tom="volume"
            />
            <Indicador
              rotulo="Consumo em aberto"
              valor={BRL(totais.saldo)}
              detalhe="Entregue nas mesas abertas e ainda não pago."
              icone={<Wallet size={17} weight="bold" />}
              tom="valor"
            />
            <Indicador
              rotulo="Pedidos ativos"
              valor={String(totais.pedidos)}
              detalhe={`${totais.itensFila} ${totais.itensFila === 1 ? "item" : "itens"} na fila de produção`}
              icone={<Receipt size={17} weight="bold" />}
              tom="volume"
            />
            <Indicador
              rotulo="Mesas livres"
              valor={String(Math.max(0, todas.length - comTempo.length))}
              detalhe="Prontas para check-in pelo QR ou pelo garçom."
              icone={<CheckCircle size={17} weight="bold" />}
              tom="volume"
            />
          </div>

          <div className="dash-mesas__toolbar">
            <label className="dash-mesas__search">
              <MagnifyingGlass size={15} weight="bold" />
              <input
                type="search"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar mesa, cliente ou garçom"
                aria-label="Buscar mesa, cliente ou garçom"
              />
            </label>
            <label className="dash-mesas__select">
              <span className="sr-only">Ordenar mesas abertas</span>
              <select value={ordem} onChange={(event) => setOrdem(event.target.value as Ordem)}>
                {ORDENS.map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <div className="dash-mesas__chips" role="group" aria-label="Filtrar por situação">
              {SITUACOES.map((opcao) => (
                <button
                  key={opcao.id}
                  type="button"
                  aria-pressed={situacao === opcao.id}
                  onClick={() => setSituacao(opcao.id)}
                >
                  {opcao.rotulo}
                </button>
              ))}
            </div>
          </div>

          {erro && (
            <p className="dash-mesas__erro" role="alert">
              <WarningCircle size={16} weight="fill" />
              <span>{dados ? "Não foi possível atualizar. Exibindo os últimos dados carregados." : erro}</span>
              <button type="button" onClick={() => void carregar()}>
                Tentar novamente
              </button>
            </p>
          )}

          {!dados ? (
            <p className="dash-mesas__empty">
              {erro ? "Não foi possível carregar as mesas abertas." : "Carregando as mesas abertas…"}
            </p>
          ) : visiveis.length === 0 ? (
            <p className="dash-mesas__empty">
              {comTempo.length === 0
                ? "Nenhuma mesa aberta neste momento. O salão está livre."
                : "Nenhuma mesa encontrada com esse filtro."}
            </p>
          ) : (
            <>
              <div className="dash-mesas__grid">
                {pagina.itens.map(({ mesa, tempo }) => (
                  <CartaoMesaAberta key={mesa.id} mesa={mesa} tempo={tempo} agora={agora} />
                ))}
              </div>
              <ControlesPaginacao {...pagina} className="dash-mesas__pagination" />
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  icone,
  tom,
}: {
  rotulo: string;
  valor: string;
  detalhe: string;
  icone: ReactNode;
  tom: "valor" | "volume";
}) {
  return (
    <div className={`dash-mesas__stat dash-mesas__stat--${tom}`}>
      <span className="dash-mesas__stat-icon">{icone}</span>
      <p className="dash-mesas__stat-label">{rotulo}</p>
      <p className="dash-mesas__stat-value dado">{valor}</p>
      <p className="dash-mesas__stat-detail">{detalhe}</p>
    </div>
  );
}

/** Cartão de uma mesa aberta. Exportado para o smoke de SSR (render sem dados). */
export function CartaoMesaAberta({
  mesa,
  tempo,
  agora,
}: {
  mesa: MesaPanorama;
  tempo: TempoMesa | null;
  agora?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<MesaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const referencia = agora ?? Date.now();
  const faixa = tempo ? FAIXAS_TEMPO[tempo.id] : null;
  // #303: sessão sem pedido válido fica em "Aguardando pedido", sem faixa de atenção/crítica.
  const aguardando = aguardandoPedidoDe(mesa);
  const situacao =
    tempo?.id === "critica"
      ? "critica"
      : tempo?.id === "atencao"
        ? "atencao"
        : tempo?.id === "recente"
          ? "recente"
          : "aguardando";
  const sessao = tempoSessaoDe(mesa, referencia);
  const minutosUltimo = minutosDesde(mesa.ultimoPedidoEm, referencia);

  const alternar = () => {
    const proximo = !aberto;
    setAberto(proximo);
    if (!proximo || detalhe) return;
    setCarregando(true);
    setErro(null);
    api
      .adminMesaDetalhe(mesa.numero)
      .then((resposta) => setDetalhe(resposta))
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar os detalhes da mesa."))
      .finally(() => setCarregando(false));
  };

  return (
    <article className={`dash-mesa dash-mesa--${situacao}`} aria-label={`Mesa ${String(mesa.numero).padStart(2, "0")}`}>
      <header className="dash-mesa__top">
        <div className="dash-mesa__ident">
          <p className="dash-mesa__numero placa__numero">{String(mesa.numero).padStart(2, "0")}</p>
          <span className="dash-mesa__label">mesa</span>
        </div>
        <div className="dash-mesa__badges">
          <span className="dash-mesa__praca">{mesa.pracaNome || "Sem praça"}</span>
          {faixa ? (
            <span className={`dash-mesa__faixa dash-mesa__faixa--${situacao}`}>
              <Clock size={13} weight="bold" />
              {formatarDuracao(tempo?.minutos)} · {faixa.rotulo}
            </span>
          ) : aguardando ? (
            <span className="dash-mesa__faixa dash-mesa__faixa--aguardando">
              <Clock size={13} weight="bold" />
              Aguardando pedido
            </span>
          ) : (
            <span className="dash-mesa__faixa dash-mesa__faixa--aguardando">
              <Clock size={13} weight="bold" />
              Horário indisponível
            </span>
          )}
        </div>
      </header>

      <dl className="dash-mesa__rows">
        <div className="dash-mesa__row">
          <dt>
            <User size={13} weight="bold" /> Quem pediu
          </dt>
          <dd>{mesa.clienteNome || "Cliente não identificado"}</dd>
        </div>
        <div className="dash-mesa__row">
          <dt>
            <Users size={13} weight="bold" /> Quem está levando
          </dt>
          <dd>{mesa.garcomResponsavelNome || "Garçom a definir"}</dd>
        </div>
        <div className="dash-mesa__row" data-tempo="abertura">
          <dt>
            <Clock size={13} weight="bold" /> Aberta
          </dt>
          <dd>
            {sessao ? `há ${formatarDuracao(sessao.minutos)}` : "Horário indisponível"}
            {sessao && mesa.abertaEm ? (
              <span className="dash-mesa__row-sub"> · desde {formatarHora(mesa.abertaEm)}</span>
            ) : null}
          </dd>
        </div>
        <div className="dash-mesa__row" data-tempo="ultimo-pedido">
          <dt>
            <Receipt size={13} weight="bold" /> Último pedido
          </dt>
          <dd>
            {aguardando ? (
              <span className="dash-mesa__row-sub">Aguardando pedido</span>
            ) : minutosUltimo !== null ? (
              <>
                {`há ${formatarDuracao(minutosUltimo)}`}
                <span className="dash-mesa__row-sub"> · às {formatarHora(mesa.ultimoPedidoEm)}</span>
              </>
            ) : (
              <span className="dash-mesa__row-sub">Horário indisponível</span>
            )}
          </dd>
        </div>
        <div className="dash-mesa__row">
          <dt>
            <CookingPot size={13} weight="bold" /> Produção
          </dt>
          <dd>
            {mesa.pedidosAtivos} {mesa.pedidosAtivos === 1 ? "pedido ativo" : "pedidos ativos"}
            <span className="dash-mesa__row-sub">
              {mesa.itensNaFila > 0 && ` · ${mesa.itensNaFila} na fila`}
              {mesa.pedidosProntos > 0 && ` · ${mesa.pedidosProntos} pronto(s)`}
              {mesa.itensProntosRetirada > 0 && ` · ${mesa.itensProntosRetirada} p/ retirada`}
            </span>
          </dd>
        </div>
      </dl>

      <footer className="dash-mesa__footer">
        <div>
          <p className="dash-mesa__footer-label">Consumo em aberto</p>
          <p className="dash-mesa__footer-value dado">{BRL(mesa.saldo)}</p>
        </div>
        <p className="dash-mesa__footer-note">
          entregue {BRL(mesa.consumo)}
          {mesa.pago > 0 ? ` · já pago ${BRL(mesa.pago)}` : ""}
        </p>
      </footer>

      <button
        type="button"
        className="dash-mesa__toggle"
        aria-expanded={aberto}
        aria-controls={`dash-mesa-detalhe-${mesa.numero}`}
        onClick={alternar}
      >
        {aberto ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
        {aberto ? "Ocultar detalhes" : "Ver detalhes"}
      </button>

      {aberto && (
        <div className="dash-mesa__detalhe" id={`dash-mesa-detalhe-${mesa.numero}`}>
          {carregando && !detalhe ? (
            <p className="dash-mesa__detalhe-vazio">Carregando pedidos da mesa…</p>
          ) : erro ? (
            <p className="dash-mesa__detalhe-erro">{erro}</p>
          ) : detalhe ? (
            <>
              {detalhe.pedidos.length === 0 ? (
                <p className="dash-mesa__detalhe-vazio">Nenhum pedido lançado nesta sessão.</p>
              ) : (
                <ul className="dash-mesa__pedidos">
                  {detalhe.pedidos.map((pedido) => (
                    <li key={pedido.id} className="dash-mesa__pedido">
                      <div className="dash-mesa__pedido-top">
                        <span className="dash-mesa__pedido-id">#{pedido.id}</span>
                        <span className="dash-mesa__pedido-hora">{formatarHora(pedido.criadoEm)}</span>
                        <span className="dash-mesa__pedido-status">{STATUS_PEDIDO[pedido.status] || pedido.status}</span>
                      </div>
                      <p className="dash-mesa__pedido-quem">
                        Pedido de <strong>{pedido.clienteNome || mesa.clienteNome || "cliente não informado"}</strong>
                        {pedido.garcomNome ? (
                          <>
                            {" "}
                            · lançado por <strong>{pedido.garcomNome}</strong>
                          </>
                        ) : null}
                      </p>
                      <ul className="dash-mesa__itens">
                        {pedido.itens.map((item) => (
                          <li key={item.id} className={cn("dash-mesa__item", item.status === "cancelado" && "dash-mesa__item--cancelado")}>
                            <span className="dash-mesa__item-nome">
                              <strong>{item.quantidade}×</strong> {item.nome}
                              <span className="dash-mesa__item-setor">{item.setor}</span>
                            </span>
                            <span className="dash-mesa__item-status">{STATUS_ITEM[item.status] || item.status}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}

              {detalhe.pagamentos.length > 0 && (
                <div className="dash-mesa__pagamentos">
                  <p className="dash-mesa__footer-label">Pagamentos parciais</p>
                  <ul>
                    {detalhe.pagamentos.map((pagamento) => (
                      <li key={pagamento.id}>
                        <span>
                          {FORMA_PAGAMENTO[pagamento.forma || ""] || pagamento.forma || "forma não informada"}
                          {pagamento.criadoEm ? ` · ${formatarHora(pagamento.criadoEm)}` : ""}
                        </span>
                        <strong>{BRL(pagamento.valor)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="dash-mesa__detalhe-nota">
                Consumo em aberto é o que foi entregue e ainda não foi pago — só contas fechadas entram nas vendas do
                dashboard.
              </p>
            </>
          ) : null}
        </div>
      )}
    </article>
  );
}

const STATUS_PEDIDO: Record<string, string> = {
  recebido: "Na fila",
  em_producao: "Em preparo",
  concluido: "Pronto no setor",
  aceito: "Aceito pelo garçom",
  retirado: "Retirado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

/* Mesmas chaves de FormaPagamento/formaFromApi (pix, dinheiro, credito,
   debito): o cartão chega com o nome curto, e usar o nome antigo do banco
   aqui fazia o rótulo cair no valor cru. */
const FORMA_PAGAMENTO: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  credito: "Cartão de crédito",
  debito: "Cartão de débito",
};
