import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CallBell, Checks, Clock, Printer } from "@phosphor-icons/react";
import { OpsShell, useAnuncios } from "../components/OpsShell";
import { Badge, Btn } from "../components/ui";
import { ir, useAgora } from "../router";
import type { Pedido } from "../lib/types";
import { usePub } from "../store/usePub";
import { connectEvents } from "../lib/api";
import { elapsed } from "../lib/utils";
import { imprimirComandaGarcom } from "../lib/print";

export default function Garcom({ token }: { token: string }) {
  useEffect(() => {
    if (token) window.location.replace(`/garcom-pwa/?token=${encodeURIComponent(token)}`);
  }, [token]);
  useAnuncios("garcom");
  useAgora(1000);

  const pedidos = usePub((s) => s.pedidos);
  const hydrateGarcom = usePub((s) => s.hydrateGarcom);
  useEffect(() => {
    if (!token) return;
    void hydrateGarcom(token);
    const t = setInterval(() => void hydrateGarcom(token), 8000);
    const off = connectEvents(() => void hydrateGarcom(token), { garcom: token });
    return () => {
      clearInterval(t);
      off();
    };
  }, [token, hydrateGarcom]);

  const entregar = usePub((s) => s.entregarPedido);
  const lastError = usePub((s) => s.lastError);

  const prontos = pedidos
    .filter(
      (p) =>
        p.status !== "entregue" &&
        p.status !== "cancelado" &&
        p.itens.some((i) => ["concluido", "aceito", "retirado"].includes(i.status || "")),
    )
    .sort((a, b) => a.criadoEm - b.criadoEm);
  const entregues = pedidos
    .filter((p) => p.status === "entregue")
    .sort((a, b) => b.criadoEm - a.criadoEm)
    .slice(0, 6);

  if (!token) {
    ir("/");
    return null;
  }

  const tokenCurto = token.length > 8 ? token.slice(0, 8) + "…" : token;

  const extras = (
    <div className="flex items-center gap-1.5">
      <Badge tone="neutral">{tokenCurto}</Badge>
      <Badge tone={prontos.length ? "brass" : "neutral"}>{prontos.length} prontos</Badge>
    </div>
  );

  return (
    <OpsShell
      ativo="garcom"
      regime="operational"
      kicker="Operação · Salão"
      titulo="Entregas"
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
      <div className="grid gap-5 lg:grid-cols-3 items-start">
        <section className="lg:col-span-2">
          <AnimatePresence mode="sync">
            {prontos.length === 0 ? (
              <div className="grid place-items-center rounded-md border border-dashed border-line-strong bg-surface-raised py-20 px-6 text-center">
                <div>
                  <CallBell size={40} className="text-text-muted mx-auto" />
                  <h3 className="font-display text-3xl font-bold tracking-tight text-text mt-3">
                    Nada na bancada
                  </h3>
                  <p className="text-xs text-text-muted mt-1">
                    Os avisos sonoros anunciam automaticamente a mesa quando um prato ou bebida fica pronto.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {prontos.map((p) => (
                  <CardPronto
                    key={p.id}
                    pedido={p}
                    onEntregar={(ids, etapa) => entregar(p.id, token, ids, etapa)}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        </section>

        <aside className="rounded-md border border-line bg-surface-raised overflow-hidden">
          <div className="px-4 py-3.5 border-b border-dashed border-line-strong flex items-center justify-between">
            <h3 className="font-display text-xl font-bold tracking-tight text-text flex items-center gap-2">
              <Checks size={18} className="text-status-success-ink" /> Últimas entregas
            </h3>
          </div>
          <div className="divide-y divide-line">
            {entregues.length === 0 && (
              <p className="p-6 text-center text-xs text-text-muted">Nenhuma entrega registrada</p>
            )}
            {entregues.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid place-items-center size-10 rounded-sm bg-status-success-surface border border-status-success-border font-mono text-base font-bold text-status-success-ink shrink-0">
                  {p.mesaNome.replace("Mesa ", "").padStart(2, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text truncate">
                    {p.clienteNome} · {p.itens.reduce((a, i) => a + i.qtd, 0)} itens
                  </p>
                  <p className="font-mono text-[11px] text-text-muted">há {elapsed(p.criadoEm)}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </OpsShell>
  );
}

function labelItemStatus(s?: string) {
  switch (s) {
    case "recebido":
      return { t: "na fila", tone: "text-text-muted" };
    case "em_producao":
      return { t: "preparo", tone: "text-status-info-ink" };
    case "concluido":
      return { t: "pronto", tone: "text-status-success-ink" };
    case "aceito":
      return { t: "aceito", tone: "text-brand-ink" };
    case "retirado":
      return { t: "retirado", tone: "text-status-info-ink" };
    case "cancelado":
      return { t: "cancelado", tone: "text-status-danger-ink" };
    case "entregue":
      return { t: "entregue", tone: "text-text-muted" };
    default:
      return { t: s || "—", tone: "text-text-muted" };
  }
}

function CardPronto({
  pedido,
  onEntregar,
}: {
  pedido: Pedido;
  onEntregar: (itemIds?: number[], etapa?: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const esfriando = Date.now() - pedido.criadoEm > 1000 * 60 * 25;
  const prontos = pedido.itens.filter((i) => i.status === "concluido");
  const aceitos = pedido.itens.filter((i) => i.status === "aceito");
  const retirados = pedido.itens.filter((i) => i.status === "retirado");
  const aindaProducao = pedido.itens.filter(
    (i) => i.status === "recebido" || i.status === "em_producao",
  );
  const idsProntos = prontos.map((i) => Number(i.id)).filter((n) => Number.isFinite(n) && n > 0);

  return (
    <motion.article
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.22, 1.18, 0.36, 1] }}
      className="rounded-md border border-line bg-surface-raised overflow-hidden"
    >
      <div className="px-4 py-3.5 bg-surface-sunken border-b border-dashed border-line-strong flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-4xl font-extrabold leading-none text-text">
            {pedido.mesaNome.replace("Mesa ", "").padStart(2, "0")}
            <span className="text-xs text-text-muted ml-1.5 font-sans font-bold uppercase tracking-wider">
              mesa
            </span>
          </p>
          <p className="mt-1.5 flex items-center gap-2 text-xs">
            <span className="font-bold text-text">{pedido.clienteNome}</span>
            <span className="font-mono text-brand-ink font-bold">#{pedido.id}</span>
          </p>
        </div>
        <div className="text-right">
          <Badge key={pedido.status} className="anim-stamp" tone={esfriando ? "rose" : "brass"}>
            {esfriando ? "Esfriando" : prontos.length ? "Pronto" : "Em entrega"}
          </Badge>
          <p className="mt-1.5 flex items-center justify-end gap-1 font-mono text-xs text-text-muted">
            <Clock size={13} /> {elapsed(pedido.criadoEm)}
          </p>
        </div>
      </div>

      <ul className="px-4 py-3 divide-y divide-dashed divide-line">
        {pedido.itens.map((i) => {
          const st = labelItemStatus(i.status);
          return (
            <li key={i.id} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-2 text-sm">
              <span>
                <strong className="font-mono text-brand-ink">{i.qtd}×</strong> {i.nome}
                {i.setor === "bar" && (
                  <Badge tone="violet" className="ml-1.5">
                    Bar
                  </Badge>
                )}
                {i.removidos.length > 0 && (
                  <span className="block text-xs text-status-danger-ink">
                    sem {i.removidos.join(", ")}
                  </span>
                )}
              </span>
              <span className={"shrink-0 font-mono text-[11px] font-bold uppercase " + st.tone}>
                {i.status === "concluido" ? (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => onEntregar([Number(i.id)], "aceitar")}
                  >
                    Aceitar item
                  </button>
                ) : i.status === "aceito" ? (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => onEntregar([Number(i.id)], "retirar")}
                  >
                    Retirei
                  </button>
                ) : i.status === "retirado" ? (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => onEntregar([Number(i.id)], "entregar")}
                  >
                    Entreguei
                  </button>
                ) : (
                  st.t
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {aindaProducao.length > 0 && (
        <p className="px-4 pb-2 font-mono text-[11px] text-text-muted">
          {aindaProducao.length} item(ns) ainda em preparo
        </p>
      )}

      <div className="px-4 pb-4 pt-2 border-t border-line space-y-2">
        {idsProntos.length > 0 && (
          <Btn full size="md" variant="sage" onClick={() => onEntregar(idsProntos, "aceitar")}>
            {`Aceitar prontos (${idsProntos.length})`}
          </Btn>
        )}
        {aceitos.length > 0 && (
          <Btn
            full
            size="md"
            variant="outline"
            onClick={() => onEntregar(aceitos.map((i) => Number(i.id)), "retirar")}
          >
            Retirei aceitos ({aceitos.length})
          </Btn>
        )}
        {retirados.length > 0 && (
          <Btn
            full
            size="md"
            variant="sage"
            onClick={() => onEntregar(retirados.map((i) => Number(i.id)), "entregar")}
          >
            Entreguei retirados ({retirados.length})
          </Btn>
        )}
        <Btn full size="md" variant="secondary" onClick={() => imprimirComandaGarcom(pedido)}>
          <Printer size={16} /> Imprimir cupom
        </Btn>
      </div>
    </motion.article>
  );
}
