import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChefHat, KeyRound, LayoutGrid, LogIn, ShieldAlert, Wallet, Wine } from "lucide-react";
import { useState } from "react";
import { Logo, ThemeToggle } from "../components/ui";
import { ir } from "../router";
import { usePub } from "../store/usePub";
import { cn } from "../utils/cn";

const PAPEIS = [
  { id: "cozinha", nome: "Cozinha", desc: "Fila de preparo + voz", icon: ChefHat, tom: "from-brand-500/20 to-teal-600/10 text-brand-600 border-brand-500/30" },
  { id: "bar", nome: "Bar", desc: "Bebidas e drinks", icon: Wine, tom: "from-violet-500/15 to-fuchsia-600/10 text-violet-700 border-violet-500/30" },
  { id: "caixa", nome: "Caixa", desc: "Contas, divisão e PIX", icon: Wallet, tom: "from-teal-500/15 to-teal-600/10 text-teal-600 border-teal-500/30" },
  { id: "admin", nome: "Admin", desc: "Cardápio, mesas e painel", icon: LayoutGrid, tom: "from-sky-500/15 to-sky-600/10 text-sky-700 border-sky-500/30" },
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
    <div className="relative min-h-dvh flex items-center justify-center p-5 overflow-hidden">
      <div className="fixed inset-0 -z-10">
        <div className="glow-orb absolute -top-40 left-[15%] size-[30rem] bg-brand-500/12" />
        <div className="glow-orb absolute bottom-[-10rem] right-[5%] size-[28rem] bg-brand-500/10" />
        <div className="noise absolute inset-0" />
      </div>

      <button
        onClick={() => ir("/")}
        className="btn-press absolute top-6 left-5 sm:left-8 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-navy-800 cursor-pointer"
      >
        <ArrowLeft className="size-4" /> voltar ao pub
      </button>

      <div className="absolute top-5 right-5 sm:right-8">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.32em] text-slate-500">
            acesso da equipe
          </p>
        </div>

        <div className="glass-deep noise rounded-4xl p-6 sm:p-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {PAPEIS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPapel(p.id);
                  setErro(false);
                }}
                className={cn(
                  "btn-press relative rounded-2xl border p-3.5 text-center cursor-pointer transition-all",
                  papel === p.id
                    ? `bg-gradient-to-br ${p.tom} ring-brand`
                    : "bg-slate-100/60 border-slate-200 text-slate-500 hover:text-navy-800 hover:bg-slate-100"
                )}
              >
                <p.icon className="size-6 mx-auto" />
                <p className="mt-2 text-[11px] font-bold uppercase tracking-wider">{p.nome}</p>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {papel && ativo && (
              <motion.div
                key={papel}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="pt-6 space-y-3">
                  <div className={cn("flex items-center gap-3 rounded-2xl border bg-slate-100 px-4 h-13 transition-colors", erro ? "border-rose-500/60" : "border-slate-200 focus-within:border-brand-500/60")}>
                    <KeyRound className={cn("size-4.5", erro ? "text-rose-600" : "text-slate-500")} />
                    <input
                      type="password"
                      autoFocus
                      value={senha}
                      onChange={(e) => {
                        setSenha(e.target.value);
                        setErro(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && entrar()}
                      placeholder={`Senha da ${ativo.nome.toLowerCase()}`}
                      className="flex-1 bg-transparent text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none h-full"
                    />
                  </div>
                  <AnimatePresence>
                    {erro && (
                      <motion.p
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-600"
                      >
                        <ShieldAlert className="size-3.5" /> Senha incorreta — tente de novo
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={entrar}
                    className="btn-press w-full h-13 rounded-2xl bg-gradient-to-br from-brand-500 to-teal-600 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-[0_14px_38px_-8px_rgba(0,196,180,0.55)] cursor-pointer"
                  >
                    <LogIn className="size-4.5" /> Entrar como {ativo.nome}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </motion.div>
    </div>
  );
}
