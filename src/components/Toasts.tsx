import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BellRinging,
  Checks,
  CookingPot,
  ForkKnife,
  QrCode,
  Receipt,
  XCircle,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { usePub } from "../store/usePub";
import type { EventoTipo } from "../lib/types";
import { hora } from "../lib/utils";

const ICONES: Record<EventoTipo, PhosphorIcon> = {
  "pedido-novo": Receipt,
  "pedido-aceito": CookingPot,
  "pedido-pronto": ForkKnife,
  "pedido-entregue": Checks,
  "pedido-cancelado": XCircle,
  "pix-avisado": QrCode,
  "sessao-fechada": BellRinging,
};

export function Toasts() {
  const eventos = usePub((s) => s.eventos);
  const [pilha, setPilha] = useState<{ id: number; texto: string; tipo: EventoTipo; em: number }[]>([]);
  const visto = useRef(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const novos = eventos.filter((e) => e.seq > visto.current);
    if (!novos.length) return;
    visto.current = novos[novos.length - 1].seq;
    const agora = Date.now();
    setPilha((p) =>
      [...p, ...novos.slice(-3).map((n) => ({ id: n.seq, texto: n.texto, tipo: n.tipo, em: agora }))].slice(-4),
    );
  }, [eventos]);

  useEffect(() => {
    if (!pilha.length) return;
    const t = setTimeout(() => setPilha((p) => p.slice(1)), 4200);
    return () => clearTimeout(t);
  }, [pilha]);

  return (
    <div
      aria-live="polite"
      className="fixed top-4 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
    >
      <AnimatePresence>
        {pilha.map((t) => {
          const Icon = ICONES[t.tipo];
          return (
            <motion.div
              key={t.id}
              layout
              initial={reduceMotion ? { opacity: 0 } : { y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { y: -8, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto flex items-center gap-3 rounded-md border border-line bg-surface-raised shadow-float px-4 py-3 max-w-sm w-full"
            >
              <Icon size={18} weight="fill" className="text-brand-ink shrink-0" />
              <p className="flex-1 text-xs font-semibold text-text leading-snug">{t.texto}</p>
              <span className="text-[11px] font-mono text-text-muted shrink-0">{hora(t.em)}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
