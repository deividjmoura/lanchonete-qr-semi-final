import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, CheckCircle2, CircleAlert, Flame, Printer, Timer } from "lucide-react";
import { OpsShell, useAnuncios } from "../components/OpsShell";
import { Badge, Btn, LivePill } from "../components/ui";
import type { Pedido } from "../lib/types";
import { usePub } from "../store/usePub";
import { connectEvents } from "../lib/api";
import { elapsed } from "../lib/utils";
import { imprimirComanda } from "../lib/print";
import { cn } from "../utils/cn";
import { ir, useAgora } from "../router";

const COLUNAS = [
  { id: "na_fila", titulo: "Na fila", desc: "chegou agora", acento: "text-amber-300", borda: "border-amber-400/30", bg: "from-amber-400/15" },
  { id: "em_producao", titulo: "Em produção", desc: "na chapa", acento: "text-sky-300", borda: "border-sky-400/30", bg: "from-sky-400/12" },
  { id: "pronto", titulo: "Prontos", desc: "aguardando garçom", acento: "text-lime-300", borda: "border-lime-400/30", bg: "from-lime-400/12" },
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
    const t = setInterval(() => void hydrateCozinha(), 5000);
    const off = connectEvents(() => void hydrateCozinha());
    return () => {
      clearInterval(t);
      off();
    };
  }, [hydrateCozinha]);

  const ativos = pedidos.filter((p) => p.status !== "entregue");

  const extras = (
    <div className="flex items-center gap-2">
      {lastError && <Badge tone="rose">API: {lastError}</Badge>}
      <Badge tone="amber" pulse>{ativos.filter((p) => p.status === "na_fila").length} novos</Badge>
      <Badge tone="sky">{ativos.filter((p) => p.status === "em_producao").length} na chapa</Badge>
      <Badge tone="lime">{ativos.filter((p) => p.status === "pronto").length} prontos</Badge>
    </div>
  );

  return (
    <OpsShell ativo="cozinha" kicker="operação · cozinha" titulo={<>Chapa <span className="text-gradient">acesa</span></>} extra={extras}>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUNAS.map((col) => {
          const lista = ativos.filter((p) => p.status === col.id).sort((a, b) => a.criadoEm - b.criadoEm);
          return (
            <section key={col.id} className={cn("glass rounded-3xl p-4 bg-gradient-to-b to-transparent min-h-56", col.bg)}>
              <header className="flex items-center justify-between px-1.5 pb-3">
                <div>
                  <h2 className={cn("font-display text-3xl leading-none", col.acento)}>{col.titulo}</h2>
                  <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-stone-500 mt-1">{col.desc}</p>
                </div>
                <span className="grid place-items-center size-9 rounded-full bg-black/40 border border-white/10 font-mono text-sm font-bold text-white">
                  {lista.length}
                </span>
              </header>

              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {lista.length === 0 && (
                    <motion.div
                      key="vazio"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-2xl border border-dashed border-white/10 p-6 text-center"
                    >
                      <p className="text-xs text-stone-500">nada por aqui — aproveite o ar-condicionado</p>
                    </motion.div>
                  )}
                  {lista.map((p) => (
                    <CardPedido key={p.id} pedido={p} borda={col.borda} />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 flex items-center justify-center gap-2 text-[11px] text-stone-500">
        <LivePill /> Atualização em tempo real — equivalente ao SSE do servidor. Toque na página uma vez p/ liberar a voz.
      </p>
    </OpsShell>
  );
}

function CardPedido({ pedido, borda }: { pedido: Pedido; borda: string }) {
  const aceitar = usePub((s) => s.aceitarPedido);
  const concluir = usePub((s) => s.concluirPedido);
  const atrasado = Date.now() - pedido.criadoEm > 1000 * 60 * 15 && pedido.status === "na_fila";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 26, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, x: 30 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={cn("relative overflow-hidden rounded-2xl glass-deep noise p-4 border", borda)}
    >
      {atrasado && (
        <div className="absolute inset-x-0 top-0 flex items-center gap-1.5 bg-rose-500/20 border-b border-rose-400/30 px-3 py-1">
          <CircleAlert className="size-3 text-rose-300" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-rose-200">esperando há muito tempo</span>
        </div>
      )}

      <div className={cn("flex items-start justify-between gap-2", atrasado && "pt-4")}>
        <div>
          <p className="font-display text-4xl leading-none text-white">
            {pedido.mesaNome.replace("Mesa ", "")}
            <span className="text-base text-stone-500 ml-1.5 font-sans font-bold tracking-normal">mesa</span>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 border border-amber-400/30 px-2.5 py-0.5 text-xs font-bold text-amber-200">
              {pedido.clienteNome}
            </span>
            <span className="font-mono text-[11px] text-stone-500">#{pedido.id}</span>
          </p>
        </div>
        <div className="text-right">
          <Badge tone={pedido.status === "na_fila" ? "amber" : pedido.status === "em_producao" ? "sky" : "lime"} pulse={pedido.status !== "pronto"}>
            {pedido.status === "na_fila" ? "novo" : pedido.status === "em_producao" ? "produção" : "pronto"}
          </Badge>
          <p className="mt-1.5 flex items-center justify-end gap-1 font-mono text-xs text-stone-400 tabular">
            <Timer className="size-3" /> {elapsed(pedido.criadoEm)}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2 border-t border-white/[0.07] pt-3">
        {pedido.itens.map((i) => (
          <li key={i.id} className="text-[13px] leading-snug">
            <p className="text-stone-100 font-medium">
              <b className="font-mono text-amber-300">{i.qtd}×</b> {i.nome}
              {i.escolha && <span className="ml-1.5 rounded-md bg-sky-400/15 border border-sky-400/30 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">{i.escolha.nome}</span>}
            </p>
            {(i.adicionais.length > 0 || i.removidos.length > 0 || i.obs) && (
              <p className="mt-0.5 text-[11px] text-stone-500">
                {i.adicionais.length > 0 && <span className="text-lime-300/90">+ {i.adicionais.map((a) => a.nome).join(", ")} </span>}
                {i.removidos.length > 0 && <span className="text-rose-300/90">· sem {i.removidos.join(", ")} </span>}
                {i.obs && <span className="block italic text-stone-400">“{i.obs}”</span>}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3.5 space-y-2">
        {pedido.status === "na_fila" && (
          <Btn full size="sm" onClick={() => aceitar(pedido.id, "cozinha")}>
            <Flame className="size-4" /> Aceitar pedido
          </Btn>
        )}
        {pedido.status === "em_producao" && (
          <Btn full size="sm" variant="lime" onClick={() => concluir(pedido.id, "cozinha")}>
            <CheckCircle2 className="size-4" /> Concluir — chama o garçom
          </Btn>
        )}
        {pedido.status === "pronto" && (
          <p className="flex items-center justify-center gap-1.5 rounded-xl bg-lime-400/10 border border-lime-400/25 py-2 text-[11px] font-bold uppercase tracking-widest text-lime-300">
            <BellRing className="size-3.5 animate-pulse-soft" /> aguardando retirada
          </p>
        )}
        <Btn full size="sm" variant="outline" onClick={() => imprimirComanda(pedido)}>
          <Printer className="size-4" /> Imprimir comanda
        </Btn>
      </div>
    </motion.article>
  );
}
