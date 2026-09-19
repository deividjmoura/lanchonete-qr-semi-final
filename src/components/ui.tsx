import { motion, AnimatePresence } from "framer-motion";
import { X, Flame, Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { cn } from "../utils/cn";
import { alternarTema, temaAtual, EVENTO_TEMA, type Tema } from "../lib/tema";

/* ---------- Logo ----------
 * Assets em public/logo/. Vários PNG têm painel navy opaco “assado” na arte.
 * - Um único asset horizontal (claro) nos dois temas (cyan legível em fundo escuro).
 * - No load, canvas remove pixels navy/quase-pretos → fundo realmente transparente.
 * - Fallback: mark se horizontal falhar. */
const LOGO_SRC = "/logo/qradmin-horizontal.png";
const LOGO_MARK = "/logo/qradmin-mark.png";

/** Remove fundo navy/preto típico dos exports da marca (painel retangular). */
function knockoutNavyData(imageData: ImageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];
    if (a < 8) continue;
    // painel ~ rgb(15,45,72) e vizinhos
    const navy =
      r <= 42 && g <= 68 && b >= 32 && b <= 110 && b >= g - 10 && r <= g + 15;
    const nearBlack = r + g + b < 48;
    if (navy || nearBlack) d[i + 3] = 0;
  }
  return imageData;
}

function useLogoSrc(fallback = LOGO_MARK) {
  const [src, setSrc] = useState(LOGO_SRC);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        if (!c.width || !c.height) return;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, c.width, c.height);
        knockoutNavyData(id);
        ctx.putImageData(id, 0, 0);
        const url = c.toDataURL("image/png");
        if (!cancelled) setSrc(url);
      } catch {
        /* canvas tainted ou falha — mantém src original */
      }
    };
    img.onerror = () => {
      if (!cancelled) setSrc(fallback);
    };
    img.src = LOGO_SRC;
    return () => {
      cancelled = true;
    };
  }, [fallback]);

  return src;
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const src = useLogoSrc();
  const box =
    size === "sm"
      ? "h-8 max-h-8 max-w-[9rem]"
      : size === "lg"
        ? "h-16 sm:h-20 max-h-20 max-w-[min(100%,18rem)] sm:max-w-[20rem]"
        : "h-10 max-h-10 max-w-[12rem]";

  const onBroken = (e: SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (el.dataset.fallback === "1") return;
    el.dataset.fallback = "1";
    el.src = LOGO_MARK;
  };

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center select-none overflow-hidden bg-transparent",
        box
      )}
    >
      <img
        src={src}
        alt="QRAdmin"
        className="h-full w-auto max-w-full object-contain object-center bg-transparent"
        draggable={false}
        onError={onBroken}
      />
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
        "btn-press grid place-items-center size-10 rounded-full border cursor-pointer transition-colors",
        "border-slate-200 bg-slate-100/70 text-slate-500 hover:text-navy-800",
        className
      )}
    >
      {tema === "claro" ? <Moon className="size-4.5" /> : <Sun className="size-4.5" />}
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
          "bg-gradient-to-br from-brand-500 to-teal-600 text-white shadow-[0_10px_30px_-8px_rgba(0,196,180,0.5)] hover:shadow-[0_14px_38px_-6px_rgba(0,196,180,0.65)]",
        variant === "lime" &&
          "bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-[0_10px_30px_-8px_rgba(20,184,166,0.45)]",
        variant === "ghost" && "bg-slate-100/70 text-slate-700 hover:bg-slate-100 border border-slate-200",
        variant === "glass" && "glass text-slate-800 hover:border-brand-500/50",
        variant === "outline" && "border border-brand-500/50 text-brand-600 hover:bg-brand-500/10",
        variant === "danger" && "bg-rose-600/10 text-rose-600 border border-rose-500/40 hover:bg-rose-600/10",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest",
        tone === "amber" && "bg-amber-500/10 text-amber-700 border border-amber-500/30",
        tone === "lime" && "bg-teal-500/10 text-teal-700 border border-teal-500/30",
        tone === "sky" && "bg-navy-700/10 text-navy-700 border border-navy-700/25",
        tone === "rose" && "bg-rose-600/10 text-rose-600 border border-rose-400/40",
        tone === "violet" && "bg-violet-500/10 text-violet-700 border border-violet-500/30",
        tone === "zinc" && "bg-slate-100/80 text-slate-600 border border-slate-200",
        className
      )}
    >
      {pulse && <span className="size-1.5 rounded-full bg-current animate-pulse-soft" />}
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
              className="btn-press absolute top-4 right-4 z-10 grid place-items-center size-10 rounded-full bg-slate-100 border border-slate-200 text-navy-900 hover:bg-slate-200 cursor-pointer"
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
        className="btn-press h-full aspect-square grid place-items-center text-slate-600 hover:text-brand-600 cursor-pointer text-lg font-bold"
        onClick={() => onChange(Math.max(1, valor - 1))}
      >
        −
      </button>
      <span className={cn("tabular font-mono font-semibold text-navy-900", size === "sm" ? "w-6 text-xs" : "w-8 text-sm", "text-center")}>
        {valor}
      </span>
      <button
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 border border-teal-500/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-teal-600">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-teal-500 opacity-75 animate-ping" />
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
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-brand-600">
          <Flame className="size-3.5" /> {kicker}
        </p>
        <h2 className="font-display text-4xl sm:text-5xl leading-none mt-1 text-navy-900">{titulo}</h2>
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
        className={cn(
          "w-full h-12 rounded-2xl bg-slate-100 border border-slate-200 text-sm text-navy-900 placeholder:text-slate-400",
          "focus:outline-none focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20 transition",
          prefix ? "pl-11 pr-4" : "px-4"
        )}
      />
    </div>
  );
}
