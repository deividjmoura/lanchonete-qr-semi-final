import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChefHat, KeyRound, LayoutGrid, LogIn, ShieldAlert, Wallet, Wine } from "lucide-react";
import { useState } from "react";
import { Logo } from "../components/ui";
import { ir } from "../router";
import { usePub } from "../store/usePub";
import { cn } from "../utils/cn";

const PAPEIS = [
  { id: "cozinha", nome: "Cozinha", desc: "Fila de preparo + voz", icon: ChefHat, tom: "from-amber-400/25 to-orange-500/10 text-amber-300 border-amber-400/25" },
  { id: "bar", nome: "Bar", desc: "Bebidas e drinks", icon: Wine, tom: "from-violet-400/20 to-fuchsia-600/10 text-violet-300 border-violet-400/25" },
  { id: "caixa", nome: "Caixa", desc: "Contas, divisão e PIX", icon: Wallet, tom: "from-lime-400/20 to-lime-600/10 text-lime-300 border-lime-400/25" },
  { id: "admin", nome: "Admin", desc: "Cardápio, mesas e painel", icon: LayoutGrid, tom: "from-sky-400/20 to-sky-600/10 text-sky-300 border-sky-400/25" },
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
        <div className="glow-orb absolute -top-40 left-[15%] size-[30rem] bg-amber-500/14" />
        <div className="glow-orb absolute bottom-[-10rem] right-[5%] size-[28rem] bg-orange-700/12" />
        <div className="noise absolute inset-0" />
      </div>

      <button
        onClick={() => ir("/")}
        className="btn-press absolute top-6 left-5 sm:left-8 inline-flex items-center gap-2 text-xs font-semibold text-stone-400 hover:text-white cursor-pointer"
      >
        <ArrowLeft className="size-4" /> voltar ao pub
      </button>

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
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.32em] text-stone-400">
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
                    : "bg-white/[0.04] border-white/[0.08] text-stone-400 hover:text-white hover:bg-white/[0.07]"
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
                  <div className={cn("flex items-center gap-3 rounded-2xl border bg-black/40 px-4 h-13 transition-colors", erro ? "border-rose-500/60" : "border-white/12 focus-within:border-amber-400/60")}>
                    <KeyRound className={cn("size-4.5", erro ? "text-rose-400" : "text-stone-500")} />
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
                      className="flex-1 bg-transparent text-sm text-white placeholder:text-stone-600 focus:outline-none h-full"
                    />
                  </div>
                  <AnimatePresence>
                    {erro && (
                      <motion.p
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-400"
                      >
                        <ShieldAlert className="size-3.5" /> Senha incorreta — tente de novo
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={entrar}
                    className="btn-press w-full h-13 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950 font-bold text-sm inline-flex items-center justify-center gap-2 shadow-[0_14px_38px_-8px_rgba(255,150,20,0.6)] cursor-pointer"
                  >
                    <LogIn className="size-4.5" /> Entrar como {ativo.nome}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-6 text-center text-[11px] text-stone-500 leading-relaxed">
            Ambiente demo — senha de todos os papéis:{" "}
            <button
              onClick={() => setSenha("pub123")}
              className="font-mono text-amber-300/90 hover:text-amber-200 underline decoration-dotted underline-offset-2 cursor-pointer"
            >
              pub123
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
