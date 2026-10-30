import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BeerStein,
  BellRinging,
  CheckCircle,
  Clock,
  Printer,
  WarningCircle,
} from "@phosphor-icons/react";
import { OpsShell, useAnuncios } from "../components/OpsShell";
import { Badge, Btn } from "../components/ui";
import type { Pedido } from "../lib/types";
import { usePub } from "../store/usePub";
import { api, connectEvents } from "../lib/api";
import { elapsed } from "../lib/utils";
import { imprimirComandaBar } from "../lib/print";
import { cn } from "../utils/cn";
import { ir, useAgora } from "../router";

const COLUNAS = [
  {
    id: "na_fila",
    titulo: "Na fila",
    desc: "Novos pedidos",
    acento: "text-status-warning-ink",
    regua: "border-status-warning-border",
  },
  {
    id: "em_producao",
    titulo: "Em preparo",
    desc: "No balcão",
    acento: "text-status-info-ink",
    regua: "border-status-info-border",
  },
  {
    id: "pronto",
    titulo: "Prontos",
    desc: "Aguardando garçom",
    acento: "text-status-success-ink",
    regua: "border-status-success-border",
  },
] as const;

export default function Bar() {
  const auth = usePub((s) => s.auth);
  useEffect(() => {
    if (!auth) {
      ir("/login");
      return;
    }
    if (auth.role !== "admin" && auth.role !== "bar") {
      ir(auth.role === "cozinha" ? "/cozinha" : auth.role === "caixa" ? "/caixa" : "/login");
    }
  }, [auth]);

  useAnuncios("bar");
  useAgora(1000);

  const pedidos = usePub((s) => s.pedidos);
  const hydrateBar = usePub((s) => s.hydrateBar);
  const lastError = usePub((s) => s.lastError);

  useEffect(() => {
    void hydrateBar();
    const t = setInterval(() => void hydrateBar(), 8000);
    const off = connectEvents(() => void hydrateBar());
    return () => {
      clearInterval(t);
      off();
    };
  }, [hydrateBar]);

  const ativos = pedidos.filter((p) => p.status !== "entregue");

  const extras = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="brass">{ativos.filter((p) => p.status === "na_fila").length} novos</Badge>
      <Badge tone="sky">{ativos.filter((p) => p.status === "em_producao").length} no bar</Badge>
      <Badge tone="sage">{ativos.filter((p) => p.status === "pronto").length} prontos</Badge>
    </div>
  );

  return (
    <OpsShell
      ativo="bar"
      regime="operational"
      kicker="Operação · Bar"
      titulo="Fila do balcão"
      extra={extras}
      subhead={
        lastError ? (
          <p
            role="alert"
            className="rounded-sm border border-status-danger-border bg-status-danger-surface px-3.5 py-2 text-xs font-semibold text-status-danger-ink"
          >
            {lastError}
          </p>
        ) : undefined
      }
    >
      <div className="grid gap-5 md:grid-cols-3 items-start">
        {COLUNAS.map((col) => {
          const lista = ativos
            .filter((p) => p.status === col.id)
            .sort((a, b) => a.criadoEm - b.criadoEm);
          return (
            <section key={col.id} aria-label={col.titulo} className="space-y-3">
              <header
                className={cn(
                  "flex items-center justify-between pb-2.5 border-b-2",
                  col.regua,
                )}
              >
                <div>
                  <h2
                    className={cn(
                      "font-display text-2xl sm:text-3xl font-bold tracking-tight leading-tight",
                      col.acento,
                    )}
                  >
                    {col.titulo}
                  </h2>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted mt-1">
                    {col.desc}
                  </p>
                </div>
                <span className="inline-flex min-w-9 h-9 px-2 items-center justify-center rounded-sm bg-surface-raised border border-line-strong font-mono text-sm font-bold text-text">
                  {lista.length}
                </span>
              </header>

              <div className="space-y-3">
                <AnimatePresence mode="sync">
                  {lista.length === 0 && (
                    <div
                      key="vazio"
                      className="rounded-sm border border-dashed border-line-strong bg-surface-raised/60 p-6 text-center"
                    >
                      <p className="font-mono text-xs text-text-muted uppercase tracking-wider">
                        Sem comandas nesta etapa
                      </p>
                    </div>
                  )}
                  {lista.map((p) => (
                    <CardPedido key={p.id} pedido={p} setor="bar" />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
      </div>
    </OpsShell>
  );
}

function CardPedido({ pedido, setor }: { pedido: Pedido; setor: "cozinha" | "bar" }) {
  const hydrate = usePub((s) => s.hydrateBar);
  const reportarErro = usePub((s) => s.reportarErro);
  const reduceMotion = useReducedMotion();

  const avancarItem = async (itemId: number, status: string) => {
    try {
      await api.statusItem(setor, itemId, status);
      reportarErro(null);
      await hydrate();
    } catch (e) {
      reportarErro(e instanceof Error ? e.message : "Falha ao atualizar item");
      await hydrate();
    }
  };

  const aceitar = usePub((s) => s.aceitarPedido);
  const concluir = usePub((s) => s.concluirPedido);
  const atrasado = Date.now() - pedido.criadoEm > 1000 * 60 * 15 && pedido.status === "na_fila";

  return (
    <motion.article
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.22, 1.18, 0.36, 1] }}
      className={cn(
        "rounded-md border bg-surface-raised overflow-hidden",
        atrasado ? "border-status-danger-border" : "border-line-strong",
      )}
    >
      {atrasado && (
        <div className="flex items-center gap-1.5 bg-status-danger-surface border-b border-status-danger-border px-3.5 py-1.5">
          <WarningCircle size={14} weight="fill" className="text-status-danger-ink shrink-0" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-status-danger-ink">
            Acima de 15 min na fila
          </span>
        </div>
      )}

      <div className="px-4 pt-3.5 pb-3 bg-surface-sunken border-b border-dashed border-line-strong flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-3xl sm:text-4xl font-extrabold leading-none text-text">
            {pedido.mesaNome.replace("Mesa ", "").padStart(2, "0")}
            <span className="text-xs text-text-muted ml-1.5 font-sans font-bold uppercase tracking-wider">
              mesa
            </span>
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            {pedido.clienteNome && (
              <span className="font-sans text-xs font-bold text-text">{pedido.clienteNome}</span>
            )}
            <span className="font-mono text-xs text-brand-ink font-bold">#{pedido.id}</span>
          </p>
        </div>

        <div className="text-right">
          <Badge
            key={pedido.status}
            className="anim-stamp"
            tone={
              pedido.status === "na_fila"
                ? "brass"
                : pedido.status === "em_producao"
                  ? "sky"
                  : "sage"
            }
          >
            {pedido.status === "na_fila"
              ? "novo"
              : pedido.status === "em_producao"
                ? "preparo"
                : "pronto"}
          </Badge>
          <p className="mt-1.5 flex items-center justify-end gap-1 font-mono text-xs font-semibold text-text-muted">
            <Clock size={13} /> {elapsed(pedido.criadoEm)}
          </p>
        </div>
      </div>

      <ul className="px-4 py-3 divide-y divide-dashed divide-line">
        {pedido.itens.map((i) => (
          <li key={i.id} className="py-2.5 first:pt-0 last:pb-0">
            <p
              className={cn(
                "text-base font-bold text-text leading-snug",
                i.status === "cancelado" && "line-through opacity-50",
              )}
            >
              <strong className="font-mono text-brand-ink mr-1">{i.qtd}×</strong>
              {i.nome}
              {i.escolha && (
                <Badge tone="sky" className="ml-2 align-middle">
                  {i.escolha.nome}
                </Badge>
              )}
            </p>

            {(i.adicionais.length > 0 || i.removidos.length > 0 || i.obs) && (
              <div className="mt-1 space-y-0.5 text-xs">
                {i.adicionais.length > 0 && (
                  <p className="font-semibold text-status-success-ink">
                    + {i.adicionais.map((a) => a.nome).join(", ")}
                  </p>
                )}
                {i.removidos.length > 0 && (
                  <p className="font-semibold text-status-danger-ink">
                    sem {i.removidos.join(", ")}
                  </p>
                )}
                {i.obs && <p className="italic text-text-muted">“{i.obs}”</p>}
              </div>
            )}

            {i.status === "recebido" || i.status === "em_producao" ? (
              <button
                type="button"
                className="mt-2 min-h-9 px-2.5 rounded-xs border border-brand-border bg-brand-surface font-mono text-[11px] font-bold uppercase tracking-wider text-brand-ink hover:bg-brand hover:text-brand-contrast transition-colors"
                onClick={() =>
                  void avancarItem(
                    Number(i.id),
                    i.status === "recebido" ? "em_producao" : "concluido",
                  )
                }
              >
                {i.status === "recebido" ? "Iniciar este item" : "Liberar este item"}
              </button>
            ) : (
              <span className="mt-1.5 block font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {{
                  concluido: "Pronto · aguardando retirada",
                  aceito: "Garçom aceitou",
                  retirado: "Retirado · em entrega",
                  entregue: "Entregue",
                  cancelado: "Cancelado",
                }[i.status as string] || i.status}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="px-4 pb-4 pt-2 border-t border-line space-y-2">
        {pedido.status === "na_fila" && (
          <Btn full size="md" onClick={() => aceitar(pedido.id, "bar")}>
            <BeerStein size={18} weight="fill" /> Aceitar pedido
          </Btn>
        )}
        {pedido.status === "em_producao" && (
          <Btn full size="md" variant="sage" onClick={() => concluir(pedido.id, "bar")}>
            <CheckCircle size={18} weight="fill" /> Concluir — chama o garçom
          </Btn>
        )}
        {pedido.status === "pronto" && (
          <p className="min-h-11 flex items-center justify-center gap-1.5 rounded-sm bg-status-success-surface border border-status-success-border font-mono text-xs font-bold uppercase tracking-wider text-status-success-ink">
            <BellRinging size={16} weight="fill" /> Aguardando retirada
          </p>
        )}
        <Btn full size="md" variant="secondary" onClick={() => imprimirComandaBar(pedido)}>
          <Printer size={17} /> Imprimir comanda
        </Btn>
      </div>
    </motion.article>
  );
}
