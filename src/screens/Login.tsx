import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  BeerStein,
  CashRegister,
  CookingPot,
  Key,
  SignIn,
  SquaresFour,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Logo, ThemeToggle } from "../components/ui";
import { ir } from "../router";
import { usePub } from "../store/usePub";
import { cn } from "../utils/cn";

const PAPEIS = [
  { id: "cozinha", nome: "Cozinha", desc: "Fila da chapa", Icon: CookingPot },
  { id: "bar", nome: "Bar", desc: "Chopes e bebidas", Icon: BeerStein },
  { id: "caixa", nome: "Caixa", desc: "Contas e PIX", Icon: CashRegister },
  { id: "admin", nome: "Admin", desc: "Gestão e salão", Icon: SquaresFour },
] as const;

export default function Login() {
  const loginApi = usePub((s) => s.loginApi);
  const [papel, setPapel] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(false);
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReducedMotion();

  const entrar = async () => {
    if (!papel || busy) return;
    setBusy(true);
    const role = await loginApi(papel, senha);
    setBusy(false);
    if (!role) {
      setErro(true);
      setTimeout(() => setErro(false), 1600);
      return;
    }
    ir(
      role === "admin"
        ? "/admin"
        : role === "cozinha"
          ? "/cozinha"
          : role === "bar"
            ? "/bar"
            : "/caixa",
    );
  };

  const ativo = PAPEIS.find((p) => p.id === papel);

  return (
    <div
      data-regime="expressive"
      className="min-h-dvh flex flex-col justify-between p-4 sm:p-6 bg-surface text-text"
    >
      <header className="mx-auto w-full max-w-5xl flex items-center justify-between">
        <button
          type="button"
          onClick={() => ir("/")}
          className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-line bg-surface-raised px-3 text-xs font-semibold text-text-muted hover:text-text hover:border-line-strong transition-colors"
        >
          <ArrowLeft size={15} weight="bold" /> Voltar
        </button>
        <ThemeToggle />
      </header>

      <main className="my-auto py-8 flex items-center justify-center">
        <motion.section
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1.18, 0.36, 1] }}
          aria-labelledby="login-titulo"
          className="w-full max-w-md rounded-md border border-line-strong bg-surface-raised overflow-hidden"
        >
          {/* Cabeçalho da comanda de acesso */}
          <div className="px-6 pt-6 pb-5 flex items-center justify-between gap-4 border-b border-dashed border-line-strong">
            <Logo size="md" />
            <div className="text-right">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-ink block">
                Posto
              </span>
              <h1
                id="login-titulo"
                className="font-display text-xl font-extrabold uppercase tracking-tight text-text leading-none mt-1"
              >
                Acesso Equipe
              </h1>
            </div>
          </div>

          <div className="p-6">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-3">
              Selecione o setor
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PAPEIS.map((p) => {
                const selecionado = papel === p.id;
                const Icon = p.Icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={selecionado}
                    onClick={() => {
                      setPapel(p.id);
                      setErro(false);
                    }}
                    className={cn(
                      "min-h-20 rounded-sm border px-2.5 py-3 flex flex-col items-center justify-center gap-1.5 text-center transition-colors duration-150",
                      selecionado
                        ? "bg-brand text-brand-contrast border-brand"
                        : "bg-surface-sunken border-line text-text-muted hover:text-text hover:border-line-strong hover:bg-surface-hover",
                    )}
                  >
                    <Icon size={22} weight={selecionado ? "fill" : "regular"} />
                    <span className="font-display text-sm font-extrabold uppercase tracking-wide leading-none mt-0.5">
                      {p.nome}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {papel && ativo && (
                <motion.div
                  key={papel}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
                >
                <form
                  className="mt-5 pt-5 border-t border-dashed border-line-strong space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void entrar();
                  }}
                >
                  <input
                    type="text"
                    name="username"
                    id="login-usuario"
                    autoComplete="username"
                    value={papel}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                  />

                  <label htmlFor="login-senha" className="block">
                    <span className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted mb-1.5">
                      <span>Credencial · {ativo.nome}</span>
                      <span>{ativo.desc}</span>
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-2.5 rounded-sm border bg-surface-sunken px-3.5 h-12 transition-colors",
                        erro
                          ? "border-status-danger-border"
                          : "border-line-strong focus-within:border-brand",
                      )}
                    >
                      <Key
                        size={18}
                        weight="regular"
                        className={erro ? "text-status-danger-ink shrink-0" : "text-text-muted shrink-0"}
                      />
                      <input
                        type="password"
                        name="password"
                        id="login-senha"
                        autoComplete="current-password"
                        autoFocus
                        value={senha}
                        onChange={(e) => {
                          setSenha(e.target.value);
                          setErro(false);
                        }}
                        placeholder={`Senha de ${ativo.nome.toLowerCase()}`}
                        className="flex-1 bg-transparent text-sm text-text placeholder:text-text-subtle focus:outline-none h-full"
                      />
                    </span>
                  </label>

                  {erro && (
                    <p
                      role="alert"
                      className="flex items-center gap-2 rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs font-semibold text-status-danger-ink"
                    >
                      <WarningCircle size={16} weight="fill" className="shrink-0" />
                      Senha incorreta — confira e tente novamente.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-12 rounded-sm bg-brand border border-brand text-brand-contrast font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-brand-hover active:translate-y-px disabled:opacity-45 transition-colors duration-150"
                  >
                    <SignIn size={18} weight="bold" />
                    {busy ? "Autenticando…" : `Entrar em ${ativo.nome}`}
                  </button>
                </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      </main>

      <footer className="mx-auto w-full max-w-5xl text-center">
        <p className="font-mono text-[11px] text-text-muted">QR Admin · Operação de salão</p>
      </footer>
    </div>
  );
}
