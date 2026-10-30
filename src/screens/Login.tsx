import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, ChefHat, KeyRound, LayoutGrid, LogIn, ShieldAlert, Wallet, Wine } from "lucide-react";
import { useState } from "react";
import { Logo, ThemeToggle } from "../components/ui";
import { ir } from "../router";
import { usePub } from "../store/usePub";
import { cn } from "../utils/cn";

const PAPEIS = [
  { id: "cozinha", nome: "Cozinha", desc: "Fila de preparo + voz", icon: ChefHat, tom: "text-brand-600 bg-brand-500/10 border-brand-500/25" },
  { id: "bar", nome: "Bar", desc: "Bebidas e drinks", icon: Wine, tom: "text-violet-700 bg-violet-500/10 border-violet-500/25" },
  { id: "caixa", nome: "Caixa", desc: "Contas, divisão e PIX", icon: Wallet, tom: "text-teal-700 bg-teal-500/10 border-teal-500/25" },
  { id: "admin", nome: "Admin", desc: "Cardápio, mesas e painel", icon: LayoutGrid, tom: "text-sky-700 bg-sky-500/10 border-sky-500/25" },
];

export default function Login() {
  const loginApi = usePub((s) => s.loginApi);
  const [papel, setPapel] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(false);
  const [busy, setBusy] = useState(false);

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
            : "/caixa"
    );
  };

  const ativo = PAPEIS.find((p) => p.id === papel);

  return (
    <div className="relative min-h-dvh grid lg:grid-cols-[1.02fr_1fr] bg-brand-shell">
      {/* ---------- painel de marca (desktop) ---------- */}
      <aside className="relative hidden lg:flex flex-col justify-between p-12 xl:p-16 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-14 -right-10 w-72 h-72 opacity-[.045]"
          style={{ background: "url('/logo/qradmin-mark.svg') center / contain no-repeat" }}
        />
        <Logo size="md" />

        <div className="relative max-w-md">
          <p className="ds-kicker">
            <span className="inline-block size-1.5 rounded-full bg-brand-500" /> painel da equipe
          </p>
          <h1 className="font-display text-[3.4rem] xl:text-[4rem] leading-[0.92] text-navy-900 mt-4">
            Do celular
            <br />
            da mesa à
            <br />
            <span className="text-brand-600">cozinha.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-600">
            Cardápio por QR Code, comanda acumulativa, voz na cozinha e caixa com PIX.
            Tudo em tempo real, em qualquer aparelho.
          </p>

          <ul className="mt-8 grid gap-2.5">
            {["Pedido cai na cozinha na hora", "Garçom avisado por voz", "Conta fechada sem papelada"].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                <span className="grid place-items-center size-5 rounded-full bg-teal-500/12 border border-teal-500/25 text-teal-700">
                  <Check className="size-3" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          QR Admin · pedidos por QR Code
        </p>
      </aside>

      {/* ---------- acesso ---------- */}
      <main className="relative flex flex-col px-5 py-6 sm:px-8 sm:py-8 lg:border-l lg:border-slate-200 lg:bg-white">
        <div className="flex items-center justify-between">
          <button
            onClick={() => ir("/")}
            className="btn-press inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 h-10 text-xs font-bold text-slate-600 hover:text-navy-900 hover:border-slate-300 cursor-pointer"
          >
            <ArrowLeft className="size-4" /> voltar
          </button>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md"
          >
            <div className="lg:hidden flex justify-center mb-7">
              <Logo size="md" />
            </div>

            <div className="mb-7">
              <p className="ds-kicker ds-kicker--muted">acesso da equipe</p>
              <h2 className="font-display text-[2rem] sm:text-4xl leading-tight text-navy-900 mt-2">
                Quem está <span className="text-brand-600">no salão?</span>
              </h2>
              <p className="mt-2 text-sm text-slate-500">Escolha seu posto e informe a senha.</p>
            </div>

            <div className="glass-deep p-4 sm:p-6">
              <div className="grid grid-cols-2 gap-2.5">
                {PAPEIS.map((p) => {
                  const sel = papel === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPapel(p.id);
                        setErro(false);
                      }}
                      aria-pressed={sel}
                      className={cn(
                        "btn-press group relative rounded-2xl border p-3.5 text-left cursor-pointer transition-all",
                        sel
                          ? "border-brand-500/50 bg-brand-500/[0.07] ring-brand"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-100/60"
                      )}
                    >
                      <span
                        className={cn(
                          "grid place-items-center size-9 rounded-xl border transition-colors",
                          sel ? p.tom : "border-slate-200 bg-slate-50 " + p.tom.split(" ")[0]
                        )}
                      >
                        <p.icon className="size-4.5" />
                      </span>
                      <p className={cn("mt-2.5 text-sm font-bold", sel ? "text-navy-900" : "text-slate-700")}>{p.nome}</p>
                      <p className="text-[11px] leading-tight text-slate-500 mt-0.5">{p.desc}</p>
                      {sel && (
                        <motion.span
                          layoutId="papel-sel"
                          className="absolute top-2.5 right-2.5 grid place-items-center size-4 rounded-full bg-brand-600 text-white"
                        >
                          <Check className="size-2.5" strokeWidth={3} />
                        </motion.span>
                      )}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                {papel && ativo && (
                  <motion.div
                    key={papel}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <form
                      className="pt-5 space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void entrar();
                      }}
                    >
                      {/* Usuário = perfil escolhido (admin, cozinha, bar, caixa); permite ao navegador salvar a senha com o usuário certo. */}
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
                      <label className="block">
                        <span className="ds-label">senha da {ativo.nome.toLowerCase()}</span>
                        <div
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl border bg-slate-100 px-3.5 h-12 transition-all",
                            erro
                              ? "border-rose-500/60 bg-rose-600/[0.06]"
                              : "border-slate-200 focus-within:border-brand-500/60 focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(232,93,47,0.14)]"
                          )}
                        >
                          <KeyRound className={cn("size-4 shrink-0", erro ? "text-rose-600" : "text-slate-400")} />
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
                            placeholder="••••••••"
                            className="flex-1 min-w-0 bg-transparent text-sm font-medium text-navy-900 placeholder:text-slate-400 focus:outline-none h-full"
                          />
                        </div>
                      </label>

                      <AnimatePresence>
                        {erro && (
                          <motion.p
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            role="alert"
                            className="flex items-center gap-1.5 text-xs font-bold text-rose-600"
                          >
                            <ShieldAlert className="size-3.5" /> Senha incorreta — tente de novo
                          </motion.p>
                        )}
                      </AnimatePresence>

                      <motion.button
                        type="submit"
                        whileTap={{ scale: 0.975 }}
                        disabled={busy}
                        className="btn-press ds-btn ds-btn--brand w-full disabled:opacity-60"
                      >
                        <LogIn className="size-4.5" />
                        {busy ? "Entrando…" : `Entrar como ${ativo.nome}`}
                      </motion.button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {!papel && (
                <p className="pt-4 text-center text-[11px] font-medium text-slate-400">
                  Selecione um posto para liberar o campo de senha.
                </p>
              )}
            </div>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">
              Esqueceu a senha? Peça ao administrador para redefinir no painel.
            </p>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
