import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, CheckCircle2, CircleAlert, Flame, Printer, Timer } from "lucide-react";
import { OpsShell, useAnuncios } from "../components/OpsShell";
import { Badge, Btn, LivePill } from "../components/ui";
import type { Pedido } from "../lib/types";
import { usePub } from "../store/usePub";
import { api, connectEvents } from "../lib/api";
import { elapsed } from "../lib/utils";
import { imprimirComandaCozinha } from "../lib/print";
import { cn } from "../utils/cn";
import { ir, useAgora } from "../router";

const COLUNAS = [
  {
    id: "na_fila",
    titulo: "Na fila",
    desc: "chegou agora",
    acento: "text-amber-700",
    ponto: "bg-amber-500",
    borda: "border-amber-500/35",
    topo: "from-amber-500/70 to-amber-500/10",
  },
  {
    id: "em_producao",
    titulo: "Em produção",
    desc: "na chapa",
    acento: "text-brand-600",
    ponto: "bg-brand-500",
    borda: "border-brand-500/35",
    topo: "from-brand-500/70 to-brand-500/10",
  },
  {
    id: "pronto",
    titulo: "Prontos",
    desc: "aguardando garçom",
    acento: "text-teal-700",
    ponto: "bg-teal-500",
    borda: "border-teal-500/35",
    topo: "from-teal-500/70 to-teal-500/10",
  },
] as const;

export default function Cozinha() {
  const auth = usePub((s) => s.auth);
  useEffect(() => {
    if (!auth) {
      ir("/login");
      return;
    }
    if (auth.role !== "admin" && auth.role !== "cozinha") {
      ir(auth.role === "bar" ? "/bar" : auth.role === "caixa" ? "/caixa" : "/login");
    }
  }, [auth]);

  useAnuncios("cozinha");
  // lastError exibido abaixo
  useAgora(1000);

  const pedidos = usePub((s) => s.pedidos);
  const hydrateCozinha = usePub((s) => s.hydrateCozinha);
  const lastError = usePub((s) => s.lastError);
  useEffect(() => {
    void hydrateCozinha();
    const t = setInterval(() => void hydrateCozinha(), 8000);
    const off = connectEvents(() => void hydrateCozinha());
    return () => {
      clearInterval(t);
      off();
    };
  }, [hydrateCozinha]);

  const ativos = pedidos.filter((p) => p.status !== "entregue");

  const extras = (
    <div className="flex flex-wrap items-center gap-2">
      {lastError && <Badge tone="rose">API: {lastError}</Badge>}
      <Badge tone="amber" pulse>{ativos.filter((p) => p.status === "na_fila").length} novos</Badge>
      <Badge tone="sky">{ativos.filter((p) => p.status === "em_producao").length} na chapa</Badge>
      <Badge tone="lime">{ativos.filter((p) => p.status === "pronto").length} prontos</Badge>
    </div>
  );

  return (
    <OpsShell
      ativo="cozinha"
      kicker="operação · cozinha"
      titulo={<>Chapa <span className="text-brand-600">acesa</span></>}
      extra={extras}
    >
      <div className="grid gap-3.5 md:grid-cols-3 items-start">
        {COLUNAS.map((col) => {
          const lista = ativos.filter((p) => p.status === col.id).sort((a, b) => a.criadoEm - b.criadoEm);
          return (
            <section
              key={col.id}
              className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/60 p-3 min-h-56"
            >
              <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", col.topo)} />
              <header className="flex items-center justify-between gap-2 px-1 pt-1.5 pb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("size-2 rounded-full shrink-0", col.ponto)} />
                  <div className="min-w-0">
                    <h2 className={cn("font-display text-xl leading-none truncate", col.acento)}>{col.titulo}</h2>
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-500 mt-1">{col.desc}</p>
                  </div>
                </div>
                <span className="grid place-items-center min-w-9 h-8 px-2 rounded-lg bg-white border border-slate-200 font-mono text-sm font-bold text-navy-900 tabular">
                  {lista.length}
                </span>
              </header>

              <div className="space-y-2.5">
                <AnimatePresence mode="sync">
                  {lista.length === 0 && (
                    <motion.div
                      key="vazio"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center"
                    >
                      <p className="text-xs text-slate-500">nada por aqui — aproveite o ar-condicionado</p>
                    </motion.div>
                  )}
                  {lista.map((p) => (
                    <CardPedido key={p.id} pedido={p} borda={col.borda} setor="cozinha" />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-7 flex items-center justify-center gap-2 text-[11px] text-slate-500">
        <LivePill /> Atualização em tempo real — equivalente ao SSE do servidor. Toque na página uma vez p/ liberar a voz.
      </p>
    </OpsShell>
  );
}

function CardPedido({ pedido, borda, setor }: { pedido: Pedido; borda: string; setor: "cozinha" | "bar" }) {
  const hydrate = usePub((s) => s.hydrateCozinha);
  const avancarItem = async (itemId: number, status: string) => {
    try { await api.statusItem(setor, itemId, status); await hydrate(); }
    catch (e) { alert(e instanceof Error ? e.message : "Falha ao atualizar item"); }
  };
  const aceitar = usePub((s) => s.aceitarPedido);
  const concluir = usePub((s) => s.concluirPedido);
  const atrasado = Date.now() - pedido.criadoEm > 1000 * 60 * 15 && pedido.status === "na_fila";
  const urgente = Date.now() - pedido.criadoEm > 1000 * 60 * 10;

  return (
    <motion.article
      layout
      layoutId={`ops-cozinha-${pedido.id}`}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn(
        "relative overflow-hidden rounded-2xl bg-white border p-3.5 shadow-[var(--shadow-soft)]",
        borda
      )}
    >
      {atrasado && (
        <div className="mb-2.5 -mx-3.5 -mt-3.5 flex items-center gap-1.5 border-b border-rose-500/30 bg-rose-600/10 px-3 py-1.5">
          <CircleAlert className="size-3.5 text-rose-600 shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-rose-700">esperando há muito tempo</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[2rem] leading-none text-navy-900 tabular">
            {pedido.mesaNome.replace("Mesa ", "")}
            <span className="text-[11px] text-slate-500 ml-1.5 font-sans font-bold tracking-[0.14em] uppercase align-middle">mesa</span>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 border border-brand-500/25 px-2.5 py-0.5 text-[11px] font-bold text-brand-700 max-w-full truncate">
              {pedido.clienteNome}
            </span>
            <span className="font-mono text-[10px] text-slate-400">#{pedido.id}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <Badge tone={pedido.status === "na_fila" ? "amber" : pedido.status === "em_producao" ? "sky" : "lime"} pulse={pedido.status !== "pronto"}>
            {pedido.status === "na_fila" ? "novo" : pedido.status === "em_producao" ? "produção" : "pronto"}
          </Badge>
          <p
            className={cn(
              "mt-1.5 flex items-center justify-end gap-1 font-mono text-[11px] font-semibold tabular",
              urgente ? "text-rose-600" : "text-slate-500"
            )}
          >
            <Timer className="size-3" /> {elapsed(pedido.criadoEm)}
          </p>
        </div>
      </div>

      <ul className="mt-2.5 space-y-2 border-t border-slate-200 pt-2.5">
        {pedido.itens.map((i) => (
          <li key={i.id} className="text-[13px] leading-snug">
            <p className={cn("text-navy-900 font-semibold", i.status === "cancelado" && "line-through opacity-50")}>
              <b className="font-mono text-brand-600">{i.qtd}×</b> {i.nome}
              {i.escolha && (
                <span className="ml-1.5 rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {i.escolha.nome}
                </span>
              )}
            </p>
            {(i.status === "recebido" || i.status === "em_producao") ? (
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-1 rounded-md border border-brand-500/30 bg-brand-500/[0.08] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-brand-700 hover:bg-brand-500/15 cursor-pointer transition-colors"
                onClick={() => avancarItem(Number(i.id), i.status === "recebido" ? "em_producao" : "concluido")}
              >
                {i.status === "recebido" ? "Iniciar este item" : "Liberar este item"}
              </button>
            ) : (
              <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
                {{concluido:"Pronto · aguardando retirada",aceito:"Garçom aceitou",retirado:"Retirado · em entrega",entregue:"Entregue",cancelado:"Cancelado"}[i.status as string] || i.status}
              </span>
            )}
            {(i.adicionais.length > 0 || i.removidos.length > 0 || i.obs) && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {i.adicionais.length > 0 && <span className="text-teal-700 font-medium">+ {i.adicionais.map((a) => a.nome).join(", ")} </span>}
                {i.removidos.length > 0 && <span className="text-rose-600">· sem {i.removidos.join(", ")} </span>}
                {i.obs && <span className="mt-0.5 block italic text-slate-500">“{i.obs}”</span>}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-2">
        {pedido.status === "na_fila" && (
          <Btn full size="md" onClick={() => aceitar(pedido.id, "cozinha")}>
            <Flame className="size-4" /> Aceitar pedido
          </Btn>
        )}
        {pedido.status === "em_producao" && (
          <Btn full size="md" variant="lime" onClick={() => concluir(pedido.id, "cozinha")}>
            <CheckCircle2 className="size-4" /> Concluir — chama o garçom
          </Btn>
        )}
        {pedido.status === "pronto" && (
          <p className="flex items-center justify-center gap-1.5 rounded-xl bg-teal-500/10 border border-teal-500/30 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700">
            <BellRing className="size-3.5 animate-pulse-soft" /> aguardando retirada
          </p>
        )}
        <Btn full size="sm" variant="outline" onClick={() => imprimirComandaCozinha(pedido)}>
          <Printer className="size-4" /> Imprimir comanda
        </Btn>
      </div>

    </motion.article>
  );
}
