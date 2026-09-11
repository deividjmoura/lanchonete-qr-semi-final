import { motion, AnimatePresence } from "framer-motion";
import { X, Flame } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../utils/cn";

/* ---------- Logo ---------- */
export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "text-2xl" : size === "lg" ? "text-6xl sm:text-7xl" : "text-4xl";
  const img =
    size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14 sm:h-16 sm:w-16" : "h-10 w-10";
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", s)}>
      <img
        src="/assets/logo-cliente.png"
        alt=""
        width={size === "lg" ? 64 : size === "sm" ? 32 : 40}
        height={size === "lg" ? 64 : size === "sm" ? 32 : 40}
        className={cn(
          img,
          "rounded-full object-cover ring-1 ring-amber-400/40 shadow-[0_0_24px_-6px_rgba(255,182,39,0.45)] shrink-0"
        )}
        draggable={false}
      />
      <span className="font-display leading-none tracking-wide">
        <span className="text-white">MAJOR</span>
        <span className="text-gradient">PUB</span>
      </span>
    </span>
  );
}

/* ---------- Botão ---------- */
export function Btn({
  children,
  onClick,
  variant = "brand",
  size = "md",
  className,
  disabled,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "brand" | "ghost" | "outline" | "danger" | "lime" | "glass";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  full?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={disabled ? undefined : { y: -1 }}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "btn-press inline-flex items-center justify-center gap-2 rounded-2xl font-semibold select-none cursor-pointer",
        "transition-colors disabled:opacity-35 disabled:pointer-events-none",
        size === "sm" && "h-9 px-3.5 text-xs",
        size === "md" && "h-11 px-5 text-sm",
        size === "lg" && "h-13 px-7 text-base",
        full && "w-full",
        variant === "brand" &&
          "bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950 shadow-[0_10px_30px_-8px_rgba(255,150,20,0.55)] hover:shadow-[0_14px_38px_-6px_rgba(255,150,20,0.7)]",
        variant === "lime" &&
          "bg-gradient-to-br from-lime-300 to-lime-500 text-zinc-950 shadow-[0_10px_30px_-8px_rgba(163,230,53,0.45)]",
        variant === "ghost" && "bg-white/[0.06] text-stone-200 hover:bg-white/[0.12] border border-white/10",
        variant === "glass" && "glass text-stone-100 hover:border-amber-400/40",
        variant === "outline" && "border border-amber-400/50 text-amber-300 hover:bg-amber-400/10",
        variant === "danger" && "bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25",
        className
      )}
    >
      {children}
    </motion.button>
  );
}

/* ---------- Badge ---------- */
export function Badge({
  children,
  tone = "amber",
  className,
  pulse,
}: {
  children: ReactNode;
  tone?: "amber" | "lime" | "sky" | "rose" | "zinc" | "violet";
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest",
        tone === "amber" && "bg-amber-400/12 text-amber-300 border border-amber-400/25",
        tone === "lime" && "bg-lime-400/12 text-lime-300 border border-lime-400/25",
        tone === "sky" && "bg-sky-400/12 text-sky-300 border border-sky-400/25",
        tone === "rose" && "bg-rose-400/12 text-rose-300 border border-rose-400/25",
        tone === "violet" && "bg-violet-400/12 text-violet-300 border border-violet-400/25",
        tone === "zinc" && "bg-white/[0.07] text-stone-300 border border-white/10",
        className
      )}
    >
      {pulse && <span className="size-1.5 rounded-full bg-current animate-pulse-soft" />}
      {children}
    </span>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  children,
  wide,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** false = só fecha no X (formulários longos) */
  closeOnBackdrop?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-90 flex items-end sm:items-center justify-center sm:p-6"
          onClick={() => {
            if (closeOnBackdrop) onClose();
          }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "relative glass-deep noise rounded-t-4xl sm:rounded-4xl w-full max-h-[92dvh] overflow-y-auto no-scrollbar",
              wide ? "sm:max-w-2xl" : "sm:max-w-md"
            )}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn-press absolute top-4 right-4 z-10 grid place-items-center size-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/15 text-white hover:bg-black/75 cursor-pointer"
            >
              <X className="size-4.5" />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Quantity ---------- */
export function Qtd({
  valor,
  onChange,
  size = "md",
}: {
  valor: number;
  onChange: (v: number) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full bg-black/40 border border-white/12",
        size === "sm" ? "h-8" : "h-10"
      )}
    >
      <button
        className="btn-press h-full aspect-square grid place-items-center text-stone-300 hover:text-amber-300 cursor-pointer text-lg font-bold"
        onClick={() => onChange(Math.max(1, valor - 1))}
      >
        −
      </button>
      <span className={cn("tabular font-mono font-semibold text-white", size === "sm" ? "w-6 text-xs" : "w-8 text-sm", "text-center")}>
        {valor}
      </span>
      <button
        className="btn-press h-full aspect-square grid place-items-center text-stone-300 hover:text-amber-300 cursor-pointer text-lg font-bold"
        onClick={() => onChange(valor + 1)}
      >
        +
      </button>
    </div>
  );
}

/* ---------- Live pill ---------- */
export function LivePill({ label = "ao vivo" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-400/10 border border-lime-400/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-lime-300">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75 animate-ping" />
        <span className="relative inline-flex size-1.5 rounded-full bg-lime-400" />
      </span>
      {label}
    </span>
  );
}

/* ---------- Secção header ---------- */
export function Secao({ kicker, titulo, right }: { kicker: string; titulo: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-amber-400/90">
          <Flame className="size-3.5" /> {kicker}
        </p>
        <h2 className="font-display text-4xl sm:text-5xl leading-none mt-1 text-white">{titulo}</h2>
      </div>
      {right}
    </div>
  );
}

/* ---------- Input ---------- */
export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className,
  prefix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  prefix?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {prefix && (
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-500">{prefix}</span>
      )}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full h-12 rounded-2xl bg-black/40 border border-white/12 text-sm text-white placeholder:text-stone-500",
          "focus:outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15 transition",
          prefix ? "pl-11 pr-4" : "px-4"
        )}
      />
    </div>
  );
}
