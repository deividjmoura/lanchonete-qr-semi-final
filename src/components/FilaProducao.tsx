import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CaretDown,
  Clock,
  CookingPot,
  Hourglass,
  Printer,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "../lib/api";
import type { ItemPedido, Pedido } from "../lib/types";
import {
  ETAPAS_FILA,
  cardsDaEtapa,
  contarItensPorEtapa,
  pedidoAtrasado,
  rotuloAcaoComanda,
  type CardComanda,
  type EtapaFilaId,
} from "../lib/filaProducao";
import { usePub } from "../store/usePub";
import { elapsed } from "../lib/utils";
import "../screens/operacional.css";

type Setor = "cozinha" | "bar";

type EstadoSessoes = Record<EtapaFilaId, boolean>;

const FECHADAS: EstadoSessoes = { em_producao: false, na_fila: false };

const CHAVE_PREFERENCIA = "qradmin-fila-producao-abertas";

/**
 * Preferência de expansão por setor. O padrão é SEMPRE recolhido — a tela
 * limpa é o estado inicial pedido pela operação. Se o operador abrir uma
 * seção, a escolha sobrevive ao próximo carregamento e à hidratação de 8 s.
 */
function lerPreferencia(setor: Setor): EstadoSessoes {
  try {
    const bruto = localStorage.getItem(`${CHAVE_PREFERENCIA}:${setor}`);
    if (!bruto) return FECHADAS;
    const lido = JSON.parse(bruto) as Partial<EstadoSessoes>;
    return {
      em_producao: lido.em_producao === true,
      na_fila: lido.na_fila === true,
    };
  } catch {
    return FECHADAS;
  }
}

function gravarPreferencia(setor: Setor, estado: EstadoSessoes) {
  try {
    localStorage.setItem(`${CHAVE_PREFERENCIA}:${setor}`, JSON.stringify(estado));
  } catch {
    /* navegador pode bloquear storage: a tela continua funcionando */
  }
}


export function FilaProducao({
  setor,
  pedidos,
  descricoes,
  imprimir,
  IconeProducao = CookingPot,
}: {
  setor: Setor;
  pedidos: Pedido[];
  descricoes?: Partial<Record<EtapaFilaId, string>>;
  imprimir: (pedido: Pedido) => void;
  IconeProducao?: ComponentType<{ size?: number; weight?: "regular" | "bold" | "fill" }>;
}) {
  const hydrateCozinha = usePub((s) => s.hydrateCozinha);
  const hydrateBar = usePub((s) => s.hydrateBar);
  const reportarErro = usePub((s) => s.reportarErro);
  const lastError = usePub((s) => s.lastError);
  const reduceMotion = useReducedMotion();
  const hydrate = setor === "cozinha" ? hydrateCozinha : hydrateBar;

  const [abertas, setAbertas] = useState<EstadoSessoes>(() => lerPreferencia(setor));
  const [ocupados, setOcupados] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState("");
  const ocupadosRef = useRef<Record<string, boolean>>({});

  /* O setor pode mudar sem desmontar (troca de rota em Admin): relê a preferência. */
  useEffect(() => {
    setAbertas(lerPreferencia(setor));
  }, [setor]);

  const alternar = useCallback(
    (etapa: EtapaFilaId) => {
      setAbertas((atual) => {
        const proximo = { ...atual, [etapa]: !atual[etapa] };
        gravarPreferencia(setor, proximo);
        return proximo;
      });
    },
    [setor]
  );

  const avancar = useCallback(
    async (itens: ItemPedido[], alvo: "em_producao" | "concluido") => {
      const ids = itens
        .map((i) => Number(i.id))
        .filter((n) => Number.isSafeInteger(n) && n > 0);
      if (!ids.length) return;
      const chaves = ids.map(String);
      if (chaves.some((c) => ocupadosRef.current[c])) return;

      ocupadosRef.current = { ...ocupadosRef.current, ...Object.fromEntries(chaves.map((c) => [c, true])) };
      setOcupados(ocupadosRef.current);
      reportarErro(null);
      let concluido = true;
      try {
        for (const id of ids) await api.statusItem(setor, id, alvo);
      } catch (e) {
        concluido = false;
        reportarErro(e instanceof Error ? e.message : "Falha ao atualizar o item");
      } finally {
        if (concluido) {
          // Feedback para quando o cartão sai da seção recolhida e "desaparece".
          const nomes = itens.map((i) => `${i.qtd}× ${i.nome}`).join(", ");
          const plural = itens.length > 1;
          setAviso(
            alvo === "concluido"
              ? `${nomes} ${plural ? "liberados" : "liberado"} — já ${plural ? "aparecem" : "aparece"} para o garçom.`
              : `${nomes} ${plural ? "iniciados" : "iniciado"} — agora em produção.`
          );
        }
        ocupadosRef.current = { ...ocupadosRef.current };
        for (const c of chaves) delete ocupadosRef.current[c];
        setOcupados(ocupadosRef.current);
        await hydrate();
      }
    },
    [hydrate, reportarErro, setor]
  );

  const contagens = useMemo(() => contarItensPorEtapa(pedidos), [pedidos]);
  const cards = useMemo(
    () => ({
      em_producao: cardsDaEtapa(pedidos, "em_producao"),
      na_fila: cardsDaEtapa(pedidos, "na_fila"),
    }),
    [pedidos]
  );
  const comandasNaFila = cards.na_fila.length;
  // Intencionalmente fora de useMemo: o relógio da tela (useAgora) redesenha a
  // cada segundo e o alerta de 15 min precisa acompanhar o tempo real.
  const atrasadas = cards.na_fila.filter((c) => pedidoAtrasado(c.pedido, Date.now())).length;

  return (
    <div className="ops-stage">
      <div className="ops-stage__bar">
        <p className="ops-stage__marca">
          <span className="ops-stage__pulso" aria-hidden="true" />
          {setor === "cozinha" ? "Cozinha" : "Bar"} · fila por item
        </p>
        <div className="ops-stage__resumo">
          <span className="ops-pill ops-pill--producao">
            <strong>{contagens.em_producao}</strong> {contagens.em_producao === 1 ? "item" : "itens"} em produção
          </span>
          <span className="ops-pill ops-pill--fila">
            <strong>{contagens.na_fila}</strong> {contagens.na_fila === 1 ? "item" : "itens"} na fila
          </span>
          <span className="ops-pill">
            <strong>{comandasNaFila}</strong> {comandasNaFila === 1 ? "comanda" : "comandas"} aguardando
          </span>
          {atrasadas > 0 && (
            <span className="ops-pill ops-pill--alerta">
              <WarningCircle size={13} weight="fill" aria-hidden="true" />
              <strong>{atrasadas}</strong> acima de 15 min
            </span>
          )}
        </div>
      </div>

      {/* Região viva sempre no DOM (leitores de tela anunciam a troca de etapa),
          mas a faixa visível só ocupa espaço quando há o que mostrar. */}
      <p className="sr-only" role="status" aria-live="polite">
        {aviso}
      </p>
      {aviso && <p className="ops-aviso">{aviso}</p>}

      {lastError && (
        <p className="ops-erro" role="alert">
          <WarningCircle size={16} weight="fill" aria-hidden="true" />
          {lastError}
        </p>
      )}

      {ETAPAS_FILA.map((etapa) => {
        const lista = cards[etapa.id];
        const aberta = abertas[etapa.id];
        const Icone = etapa.id === "na_fila" ? Hourglass : IconeProducao;
        const corpoId = `fila-${setor}-${etapa.id}`;
        return (
          <section
            key={etapa.id}
            className="ops-sessao"
            data-etapa={etapa.id}
            aria-label={`${etapa.titulo} — ${setor}`}
          >
            <button
              type="button"
              className="ops-sessao__toggle"
              aria-expanded={aberta}
              aria-controls={corpoId}
              onClick={() => alternar(etapa.id)}
            >
              <span className="ops-sessao__icone" aria-hidden="true">
                <Icone size={20} weight="bold" />
              </span>
              <span className="ops-sessao__texto">
                <span className="ops-sessao__titulo">{etapa.titulo}</span>
                <span className="ops-sessao__desc">
                  {descricoes?.[etapa.id] || etapa.descricao}
                </span>
              </span>
              <span className="ops-sessao__contagem" aria-hidden="true">
                {etapa.id === "na_fila" ? contagens.na_fila : contagens.em_producao}
              </span>
              <CaretDown size={18} weight="bold" className="ops-sessao__seta" aria-hidden="true" />
            </button>

            <div className="ops-sessao__corpo" id={corpoId} hidden={!aberta}>
              {!aberta ? null : lista.length === 0 ? (
                <p className="ops-sessao__vazio">
                  {etapa.id === "na_fila"
                    ? "Nenhum item esperando início"
                    : "Nenhum item em produção agora"}
                </p>
              ) : (
                <>
                  <p className="fila-dica">Arraste para o lado para ver as próximas comandas.</p>
                  <div
                    className="fila-rolagem"
                    role="region"
                    aria-label={`Comandas ${etapa.id === "na_fila" ? "na fila" : "em produção"}`}
                    tabIndex={0}
                  >
                    <div className="fila-trilho">
                      <AnimatePresence mode="sync" initial={false}>
                        {lista.map((card) => (
                          <CardComandaItem
                            key={card.pedido.id}
                            card={card}
                            etapa={etapa.id}
                            reduceMotion={Boolean(reduceMotion)}
                            ocupados={ocupados}
                            onAvancar={avancar}
                            onImprimir={imprimir}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CardComandaItem({
  card,
  etapa,
  reduceMotion,
  ocupados,
  onAvancar,
  onImprimir,
}: {
  card: CardComanda;
  etapa: EtapaFilaId;
  reduceMotion: boolean;
  ocupados: Record<string, boolean>;
  onAvancar: (itens: ItemPedido[], alvo: "em_producao" | "concluido") => Promise<void>;
  onImprimir: (pedido: Pedido) => void;
}) {
  const etapaInfo = ETAPAS_FILA.find((e) => e.id === etapa) || ETAPAS_FILA[0];
  const { pedido, itens } = card;
  const atrasado = etapa === "na_fila" && pedidoAtrasado(pedido, Date.now());
  const algumOcupado = itens.some((i) => ocupados[String(i.id)]);
  const mesa = pedido.mesaNome.replace(/^Mesa\s*/i, "").padStart(2, "0");

  return (
    <motion.article
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1.18, 0.36, 1] }}
      className="ops-card"
      data-atrasado={atrasado ? "true" : "false"}
      aria-label={`Comanda ${pedido.id} da mesa ${mesa} — ${etapaInfo.titulo}`}
    >
      {atrasado && (
        <p className="ops-card__alerta">
          <WarningCircle size={14} weight="fill" aria-hidden="true" />
          Acima de 15 min na fila
        </p>
      )}

      <header className="ops-card__topo">
        <div>
          <p className="ops-card__mesa">
            {mesa}
            <small>mesa</small>
          </p>
          <p className="ops-card__meta">
            {pedido.clienteNome && <span>{pedido.clienteNome}</span>}
            <span className="ops-card__numero">#{pedido.id}</span>
            {pedido.garcomNome && <span>· {pedido.garcomNome}</span>}
          </p>
        </div>
        <span className="ops-card__tempo" title="Tempo desde a abertura da comanda">
          <Clock size={13} aria-hidden="true" /> {elapsed(pedido.criadoEm)}
        </span>
      </header>

      <ul className="ops-card__itens">
        {itens.map((item) => {
          const ocupado = Boolean(ocupados[String(item.id)]);
          return (
            <li key={item.id} className="ops-item">
              <p className="ops-item__nome">
                <span className="ops-item__qtd">{item.qtd}×</span>
                {item.nome}
                {item.escolha && <span className="ops-item__tag">{item.escolha.nome}</span>}
              </p>

              {(item.adicionais.length > 0 || item.removidos.length > 0 || item.obs) && (
                <div className="ops-item__extras">
                  {item.adicionais.length > 0 && (
                    <p className="add">+ {item.adicionais.map((a) => a.nome).join(", ")}</p>
                  )}
                  {item.removidos.length > 0 && <p className="rem">sem {item.removidos.join(", ")}</p>}
                  {item.obs && <p className="ops-item__obs">“{item.obs}”</p>}
                </div>
              )}

              <button
                type="button"
                className="ops-card__acao"
                disabled={ocupado || algumOcupado}
                onClick={() => void onAvancar([item], etapaInfo.proximo)}
                aria-label={`${etapaInfo.acaoItem}: ${item.qtd}× ${item.nome} (comanda ${pedido.id})`}
              >
                {ocupado ? "Gravando…" : etapa === "na_fila" ? "Iniciar este item" : "Liberar este item"}
                {!ocupado && <ArrowRight size={14} weight="bold" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="ops-card__rodape">
        <button
          type="button"
          className="ops-card__todos"
          disabled={algumOcupado}
          onClick={() => void onAvancar(itens, etapaInfo.proximo)}
          aria-label={`${rotuloAcaoComanda(etapa, itens.length)} da comanda ${pedido.id}, mesa ${mesa}`}
        >
          {etapaInfo.acaoComanda} {itens.length === 1 ? "o item" : `os ${itens.length} itens`} desta comanda
        </button>
        <button type="button" className="ops-card__imprimir" onClick={() => onImprimir(pedido)}>
          <Printer size={14} aria-hidden="true" /> Imprimir comanda
        </button>
      </footer>
    </motion.article>
  );
}

export default FilaProducao;
