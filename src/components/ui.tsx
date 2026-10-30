import { motion, AnimatePresence } from "framer-motion";
import { X, Flame, Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { alternarTema, temaAtual, EVENTO_TEMA, type Tema } from "../lib/tema";

/* =============================================================================
   ui.tsx — primitivos do Design System "Mesa & Brasa".
   As assinaturas públicas foram mantidas (nenhuma tela precisa mudar por causa
   daqui). Só a aparência mudou: marca, botões, badges, modal, campos.
   ========================================================================== */

/** Marca: símbolo (mark) + assinatura tipográfica "QR Admin". */
export function Logo({
  size = "md",
  className,
  somenteMarca = false,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  somenteMarca?: boolean;
}) {
  const dim = size === "sm" ? "size-9" : size === "lg" ? "size-16 sm:size-[4.5rem]" : "size-11";
  const word = size === "sm" ? "text-[15px]" : size === "lg" ? "text-3xl sm:text-[2rem]" : "text-lg";
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <img
        src="/logo/qradmin-mark.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn("shrink-0 rounded-[28%] shadow-[var(--shadow-soft)]", dim)}
      />
      {!somenteMarca && (
        <span className={cn("flex-col leading-none whitespace-nowrap", size === "sm" ? "hidden sm:flex" : "flex")}>
          <span className={cn("font-display tracking-tight", word)}>
            <span className="text-navy-900">QR </span>
            <span className="text-brand-600">Admin</span>
          </span>
          {size === "lg" && (
            <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.32em] text-slate-500">
              pedidos por QR Code
            </span>
          )}
        </span>
      )}
      <span className="sr-only">QR Admin</span>
    </span>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [tema, setTema] = useState<Tema>(() => temaAtual());
  useEffect(() => {
    const fn = (e: Event) => setTema((e as CustomEvent<Tema>).detail);
    window.addEventListener(EVENTO_TEMA, fn);
    return () => window.removeEventListener(EVENTO_TEMA, fn);
  }, []);
  return (
    <button
      type="button"
      onClick={alternarTema}
      title={tema === "claro" ? "Ativar tema escuro" : "Ativar tema claro"}
      aria-label={tema === "claro" ? "Ativar tema escuro" : "Ativar tema claro"}
      className={cn(
        "btn-press grid place-items-center size-10 rounded-full border cursor-pointer",
        "border-slate-200 bg-white text-slate-500 hover:text-brand-600 hover:border-brand-500/40",
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={tema}
          initial={{ rotate: -35, opacity: 0, scale: 0.7 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 35, opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.18 }}
          className="grid place-items-center"
        >
          {tema === "claro" ? <Moon className="size-4.5" /> : <Sun className="size-4.5" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/** Botão de ícone do DS — usado nas barras de ferramentas. */
export function IconButton({
  children,
  onClick,
  label,
  active,
  tone = "brand",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  active?: boolean;
  tone?: "brand" | "danger" | "neutral";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      data-on={active ? "true" : "false"}
      className={cn(
        "btn-press grid place-items-center size-10 rounded-full border cursor-pointer",
        "border-slate-200 bg-white text-slate-500",
        !active && tone === "brand" && "hover:text-brand-600 hover:border-brand-500/40",
        !active && tone === "danger" && "hover:text-rose-600 hover:border-rose-500/40",
        !active && tone === "neutral" && "hover:text-navy-900",
        active && tone === "brand" && "border-brand-500/40 bg-brand-500/10 text-brand-600",
        active && tone === "danger" && "border-rose-500/40 bg-rose-600/10 text-rose-600",
        className
      )}
    >
      {children}
    </button>
  );
}

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
      whileTap={{ scale: 0.965 }}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "btn-press ds-btn font-sans",
        size === "sm" && "ds-btn--sm",
        size === "md" && "h-11 px-5 text-sm",
        size === "lg" && "ds-btn--lg",
        full && "ds-btn--block",
        variant === "brand" && "ds-btn--brand",
        variant === "lime" && "ds-btn--success",
        variant === "ghost" && "ds-btn--surface",
        variant === "glass" && "ds-btn--surface bg-white",
        variant === "outline" && "ds-btn--outline",
        variant === "danger" && "ds-btn--danger",
        className
      )}
    >
      {children}
    </motion.button>
  );
}

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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] whitespace-nowrap",
        tone === "amber" && "bg-amber-500/12 text-amber-700 border-amber-500/30",
        tone === "lime" && "bg-teal-500/12 text-teal-700 border-teal-500/30",
        tone === "sky" && "bg-sky-500/10 text-sky-700 border-sky-500/25",
        tone === "rose" && "bg-rose-600/10 text-rose-600 border-rose-500/30",
        tone === "violet" && "bg-violet-500/10 text-violet-700 border-violet-500/25",
        tone === "zinc" && "bg-slate-100 text-slate-600 border-slate-200",
        className
      )}
    >
      {pulse && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 animate-ping" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

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
          <div className="absolute inset-0 bg-[#1a110b]/60 backdrop-blur-[3px]" />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: 60, opacity: 0, scale: 0.99 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "relative glass-deep rounded-t-4xl sm:rounded-4xl w-full max-h-[92dvh] overflow-y-auto no-scrollbar",
              "border-slate-200",
              wide ? "sm:max-w-2xl" : "sm:max-w-md"
            )}
          >
            <div aria-hidden="true" className="sm:hidden mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-slate-300" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="btn-press absolute top-3.5 right-3.5 z-10 grid place-items-center size-9 rounded-full bg-white/90 border border-slate-200 text-slate-500 hover:text-navy-900 backdrop-blur-sm cursor-pointer"
            >
              <X className="size-4" />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
        "inline-flex items-center rounded-full bg-slate-100 border border-slate-200",
        size === "sm" ? "h-8" : "h-10"
      )}
    >
      <button
        type="button"
        aria-label="Diminuir"
        className="btn-press h-full aspect-square grid place-items-center text-slate-600 hover:text-brand-600 cursor-pointer text-lg font-bold"
        onClick={() => onChange(Math.max(1, valor - 1))}
      >
        −
      </button>
      <span
        className={cn(
          "tabular font-mono font-semibold text-navy-900 text-center",
          size === "sm" ? "w-6 text-xs" : "w-8 text-sm"
        )}
      >
        {valor}
      </span>
      <button
        type="button"
        aria-label="Aumentar"
        className="btn-press h-full aspect-square grid place-items-center text-slate-600 hover:text-brand-600 cursor-pointer text-lg font-bold"
        onClick={() => onChange(valor + 1)}
      >
        +
      </button>
    </div>
  );
}

export function LivePill({ label = "ao vivo" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 border border-teal-500/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-teal-500 opacity-70 animate-ping" />
        <span className="relative inline-flex size-1.5 rounded-full bg-teal-500" />
      </span>
      {label}
    </span>
  );
}

export function Secao({ kicker, titulo, right }: { kicker: string; titulo: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="ds-kicker">
          <Flame className="size-3.5" /> {kicker}
        </p>
        <h2 className="font-display text-3xl sm:text-4xl leading-[1.05] mt-2 text-navy-900 tracking-tight">{titulo}</h2>
      </div>
      {right}
    </div>
  );
}

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
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">{prefix}</span>
      )}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn("ds-input h-12", prefix ? "pl-11 pr-4" : "px-4")}
      />
    </div>
  );
}
