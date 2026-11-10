import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Moon, Sun, X } from "@phosphor-icons/react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils/cn";
import { alternarTema, EVENTO_TEMA, temaAtual, type Tema } from "../lib/tema";
import { useGancho } from "../lib/identidade";

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

/* Símbolo reduzido "olho do passe": o olho de um QR Code (a mesa) com o centro
   aceso em menta (o pedido vivo). Substitui a marca completa abaixo de 40px,
   onde a ilustração isométrica deixa de ser legível. O anel usa a cor do texto
   corrente (currentColor), então assenta em qualquer superfície. */
export function Simbolo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn("simbolo", className)}
      width={size}
      height={size}
      viewBox="6 6 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="simbolo__anel" x="7.5" y="7.5" width="17" height="17" rx="3.5" />
      <rect className="simbolo__centro" x="13" y="13" width="6" height="6" rx="1.25" />
    </svg>
  );
}

/* Assinatura horizontal: símbolo + nome composto na voz da identidade. */
export function Assinatura({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("assinatura", className)}>
      <Simbolo size={size} />
      <span className="assinatura__nome">
        <b>QR</b>Admin
      </span>
    </span>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  /* "sm" é o que o cardápio do cliente usa: fica exatamente como estava. */
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
    <span className="brand-logo inline-flex select-none items-center" role="img" aria-label="QR Admin">
      <Assinatura size={size === "lg" ? 30 : 24} className={size === "lg" ? "text-xl" : undefined} />
    </span>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const gancho = useGancho();
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
        gancho("qr-icon-button"),
        "inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-raised text-text-muted hover:text-text hover:border-line-strong hover:bg-surface-hover transition-colors duration-150",
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
  const gancho = useGancho();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        gancho("qr-icon-button"),
        "inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-150",
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
        "qr-button inline-flex items-center justify-center gap-2 font-semibold select-none transition-[background-color,color,border-color,transform,opacity] duration-150 active:translate-y-px disabled:bg-surface-sunken disabled:text-text-muted disabled:border-line disabled:pointer-events-none",
        size === "sm" && "min-h-11 px-3.5 text-xs rounded-sm",
        size === "md" && "min-h-12 px-4 text-sm rounded-sm",
        size === "lg" && "min-h-12 px-6 text-base rounded-md",
        full && "w-full",
        (variant === "brand" || variant === "primary") &&
          "bg-brand text-brand-contrast border border-brand hover:bg-brand-hover",
        variant === "sage" &&
          "bg-status-success text-status-success-contrast border border-status-success hover:opacity-95",
        (variant === "ghost" || variant === "secondary") &&
          "bg-surface-raised text-text border border-line hover:border-line-strong hover:bg-surface-hover",
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
  const gancho = useGancho();
  return (
    <span
      className={cn(
        gancho("qr-badge"),
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
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
  className,
  open,
  onClose,
  children,
  wide,
  closeOnBackdrop = true,
  alert = false,
  labelledBy,
  describedBy,
}: {
  className?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  closeOnBackdrop?: boolean;
  alert?: boolean;
  labelledBy?: string;
  describedBy?: string;
}) {
  const gancho = useGancho();
  const reduceMotion = useReducedMotion();
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflowAnterior;
    };
  }, [open]);

  if (!portalRoot) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.14 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-3 sm:p-4"
          onClick={() => {
            if (closeOnBackdrop) onClose();
          }}
        >
          <div className="fixed inset-0 bg-surface-overlay" />
          <motion.div
            role={alert ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            initial={reduceMotion ? { opacity: 0 } : { y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 8, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              gancho("qr-modal"),
              "relative my-auto w-full max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface-raised shadow-modal no-scrollbar",
              wide ? "sm:max-w-2xl" : "sm:max-w-md",
              className,
            )}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className={cn(
                gancho("qr-icon-button"),
                "absolute top-3.5 right-3.5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-sunken text-text-muted hover:text-text hover:border-line-strong",
              )}
            >
              <X size={18} weight="bold" />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    portalRoot,
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
  const gancho = useGancho();
  return (
    <div
      className={cn(
        gancho("qr-stepper"),
        "inline-flex items-center rounded-full overflow-hidden bg-surface-sunken border border-line",
        size === "sm" ? "h-11" : "h-11",
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
    <div className="regua">
      <div>
        {kicker && <p className="rotulo">{kicker}</p>}
        <h2 className="font-display mt-1 text-2xl font-extrabold leading-tight text-text sm:text-3xl">
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
  const gancho = useGancho();
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
          gancho("qr-input"),
          "w-full h-12 rounded-sm bg-surface-sunken border border-line text-sm text-text placeholder:text-text-subtle",
          "focus:outline-none focus:border-brand transition-colors",
          prefix ? "pl-11 pr-3.5" : "px-3.5",
        )}
      />
    </div>
  );
}
