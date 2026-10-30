import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Moon, Sun, X } from "@phosphor-icons/react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { alternarTema, EVENTO_TEMA, temaAtual, type Tema } from "../lib/tema";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "ember"
  | "brass"
  | "sage"
  | "rose"
  | "violet"
  | "sky";

export type BtnVariant =
  | "brand"
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "danger"
  | "sage";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  if (size === "sm") {
    return (
      <span className="brand-logo brand-mark h-10 w-10">
        <img
          src="/logo/qradmin-mark.png"
          alt="QR Admin"
          className="h-7 w-7 object-contain select-none"
          draggable={false}
        />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "brand-logo inline-flex items-center gap-3 select-none rounded-sm border border-line-strong bg-surface-raised px-3.5 py-2.5",
        size === "lg" && "px-4 py-3",
      )}
    >
      <span className="brand-mark h-10 w-10">
        <img
          src="/logo/qradmin-mark.png"
          alt="QR Admin"
          className="h-8 w-8 object-contain"
          draggable={false}
        />
      </span>
      <span className="flex flex-col text-left leading-none">
        <span
          className={cn(
            "font-display font-extrabold uppercase tracking-tight text-text",
            size === "lg" ? "text-2xl sm:text-3xl" : "text-xl",
          )}
        >
          QR Admin
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted mt-1">
          Comanda &amp; Balcão
        </span>
      </span>
    </span>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [tema, setTema] = useState<Tema>(() => temaAtual());
  useEffect(() => {
    const fn = (e: Event) => setTema((e as CustomEvent<Tema>).detail || temaAtual());
    window.addEventListener(EVENTO_TEMA, fn);
    return () => window.removeEventListener(EVENTO_TEMA, fn);
  }, []);
  return (
    <button
      type="button"
      onClick={() => setTema(alternarTema())}
      title={tema === "claro" ? "Ativar tema escuro" : "Ativar tema claro"}
      aria-label={tema === "claro" ? "Ativar tema escuro" : "Ativar tema claro"}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-sm border border-line bg-surface-raised text-text-muted hover:text-text hover:border-line-strong hover:bg-surface-hover transition-colors duration-150",
        className,
      )}
    >
      {tema === "claro" ? <Moon size={18} weight="regular" /> : <Sun size={18} weight="regular" />}
    </button>
  );
}

export function IconBtn({
  children,
  active,
  label,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-sm border transition-colors duration-150",
        active
          ? "bg-brand-surface text-brand-ink border-brand-border"
          : "bg-surface-raised text-text-muted border-line hover:text-text hover:border-line-strong hover:bg-surface-hover",
        className,
      )}
      {...rest}
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
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  full?: boolean;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "qr-button inline-flex items-center justify-center gap-2 font-semibold select-none transition-[background-color,color,border-color,transform,opacity] duration-150 active:translate-y-px disabled:opacity-45 disabled:pointer-events-none",
        size === "sm" && "min-h-10 px-3 text-xs rounded-sm",
        size === "md" && "min-h-12 px-4 text-sm rounded-sm",
        size === "lg" && "min-h-12 px-6 text-base rounded-md",
        full && "w-full",
        (variant === "brand" || variant === "primary") &&
          "bg-brand text-brand-contrast border border-brand hover:bg-brand-hover",
        variant === "sage" &&
          "bg-status-success text-status-success-contrast border border-status-success hover:opacity-95",
        (variant === "ghost" || variant === "secondary") &&
          "bg-surface-raised text-text border border-line-strong hover:bg-surface-hover",
        variant === "outline" &&
          "bg-transparent border border-brand-border text-brand-ink hover:bg-brand-surface",
        variant === "danger" &&
          "bg-status-danger-surface text-status-danger-ink border border-status-danger-border hover:bg-status-danger hover:text-status-danger-contrast",
        className,
      )}
    >
      {children}
    </button>
  );
}

const BADGE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-text-muted border-line",
  brand: "bg-brand-surface text-brand-ink border-brand-border",
  ember: "bg-brand-surface text-brand-ink border-brand-border",
  brass: "bg-status-warning-surface text-status-warning-ink border-status-warning-border",
  sage: "bg-status-success-surface text-status-success-ink border-status-success-border",
  sky: "bg-status-info-surface text-status-info-ink border-status-info-border",
  violet: "bg-status-info-surface text-status-info-ink border-status-info-border",
  rose: "bg-status-danger-surface text-status-danger-ink border-status-danger-border",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em]",
        BADGE_CLASSES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open || !closeOnBackdrop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnBackdrop, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.14 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => {
            if (closeOnBackdrop) onClose();
          }}
        >
          <div className="absolute inset-0 bg-surface-overlay" />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={reduceMotion ? { opacity: 0 } : { y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 8, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "relative rounded-t-md sm:rounded-md border border-line-strong bg-surface-raised w-full max-h-[92dvh] overflow-y-auto no-scrollbar",
              wide ? "sm:max-w-2xl" : "sm:max-w-md",
            )}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="absolute top-3.5 right-3.5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-text hover:border-line-strong"
            >
              <X size={18} weight="bold" />
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
        "inline-flex items-center rounded-sm bg-surface-sunken border border-line-strong",
        size === "sm" ? "h-9" : "h-11",
      )}
    >
      <button
        type="button"
        aria-label="Diminuir quantidade"
        className="h-full aspect-square grid place-items-center text-text-muted hover:text-brand-ink hover:bg-surface-hover font-mono font-bold text-base"
        onClick={() => onChange(Math.max(1, valor - 1))}
      >
        −
      </button>
      <span
        className={cn(
          "font-mono font-bold text-text text-center border-x border-line",
          size === "sm" ? "w-7 text-xs" : "w-9 text-sm",
        )}
      >
        {valor}
      </span>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        className="h-full aspect-square grid place-items-center text-text-muted hover:text-brand-ink hover:bg-surface-hover font-mono font-bold text-base"
        onClick={() => onChange(valor + 1)}
      >
        +
      </button>
    </div>
  );
}

export function Secao({
  kicker,
  titulo,
  right,
}: {
  kicker?: string;
  titulo: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
      <div>
        {kicker && (
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-ink">
            {kicker}
          </p>
        )}
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight leading-none text-text mt-0.5">
          {titulo}
        </h2>
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
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-semibold text-text-muted">
          {prefix}
        </span>
      )}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full h-12 rounded-sm bg-surface-sunken border border-line-strong text-sm text-text placeholder:text-text-subtle",
          "focus:outline-none focus:border-brand transition-colors",
          prefix ? "pl-11 pr-3.5" : "px-3.5",
        )}
      />
    </div>
  );
}
