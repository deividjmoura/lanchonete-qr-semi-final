import { motion } from "framer-motion";
import { ChefHat, House, KeyRound, LogOut, Volume2, VolumeX, Wallet, LayoutGrid, Wine } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePub } from "../store/usePub";
import { ir } from "../router";
import { cn } from "../utils/cn";
import { LivePill, Logo, ThemeToggle } from "./ui";
import { TrocarSenha } from "./TrocarSenha";
import { audioMudo, beepAlerta, beepDuplo, falar, setMudo } from "../lib/sonus";
import { FRASES_GARCOM } from "../lib/data";

/** Nav por papel: admin vê tudo (exceto link fixo de garçom — usa Admin → Garçons). */
const NAV_ALL = [
  { id: "cozinha", label: "Cozinha", icon: ChefHat, to: "/cozinha", roles: ["admin", "cozinha"] as const },
  { id: "bar", label: "Bar", icon: Wine, to: "/bar", roles: ["admin", "bar"] as const },
  { id: "caixa", label: "Caixa", icon: Wallet, to: "/caixa", roles: ["admin", "caixa"] as const },
  { id: "admin", label: "Admin", icon: LayoutGrid, to: "/admin", roles: ["admin"] as const },
];

/* Anúncios por papel — reproduz o comportamento dos alertas de voz do projeto:
   · Cozinha: pedido novo → mesa + cliente
   · Garçom: pedido pronto → nº da mesa (tom leve)
   · Caixa: pix informado / sessão fechada                          */
export function useAnuncios(papel: "cozinha" | "bar" | "garcom" | "caixa") {
  const eventos = usePub((s) => s.eventos);
  const visto = useRef<number | null>(null);
  useEffect(() => {
    // Eventos anteriores à montagem não devem gerar voz ao abrir/reabrir a tela.
    if (visto.current === null) { visto.current = Math.max(0, ...eventos.map((e) => e.seq)); return; }
    const novos = eventos.filter((e) => e.seq > visto.current!);
    if (!novos.length) return;
    visto.current = Math.max(...novos.map((e) => e.seq));
    if (audioMudo()) return;
    for (const ev of novos) {
      const mesaNum = (ev.mesaNome || "").replace(/\D/g, "") || (ev.mesaNome || "").trim();
      const cliente = (ev.texto || "").replace(/^Pronto · /i, "").replace(/^Novo pedido · /i, "").trim();
      if ((papel === "cozinha" || papel === "bar") && ev.tipo === "pedido-novo") {
        beepAlerta();
        const quem = cliente && cliente !== "Cliente" ? cliente : "";
        const mesa = mesaNum ? `mesa ${mesaNum}` : ev.mesaNome || "nova mesa";
        falar(quem ? `Pedido novo! ${mesa}, ${quem}` : `Pedido novo! ${mesa}`);
      }
      if (papel === "garcom" && ev.tipo === "pedido-pronto") {
        beepDuplo();
        const mesa = mesaNum || ev.mesaNome || "";
        if (mesa) {
          const frase = FRASES_GARCOM[Math.floor(Math.random() * FRASES_GARCOM.length)];
          falar(frase(String(mesaNum || mesa).replace(/\D/g, "") || String(mesa)), { rate: 1.06, pitch: 1.05 });
        } else {
          falar("Pedido pronto na bancada!");
        }
      }
      if (papel === "caixa" && ev.tipo === "pix-avisado") {
        beepDuplo();
        const mesa = mesaNum ? `Mesa ${mesaNum}` : "Uma mesa";
        falar(`Aviso de PIX! ${mesa} disse que pagou.`);
      }
    }
  }, [eventos, papel]);
}

export function OpsShell({
  ativo,
  children,
  titulo,
  kicker,
  extra,
}: {
  ativo: string;
  children: ReactNode;
  titulo: ReactNode;
  kicker: string;
  extra?: ReactNode;
}) {
  const somLigado = usePub((s) => s.somLigado);
  const toggleSom = usePub((s) => s.toggleSom);
  const logout = usePub((s) => s.logout);
  const auth = usePub((s) => s.auth);
  const hydrateMe = usePub((s) => s.hydrateMe);
  const role = auth?.role || null;
  const [trocando, setTrocando] = useState(false);
  const trocaObrigatoria = Boolean(auth?.deveTrocar);

  /* confirma com o servidor se esta conta precisa trocar a senha (ex.: página recarregada) */
  useEffect(() => {
    if (role) void hydrateMe();
  }, [role, hydrateMe]);
  /* sem role (ex.: garçom por token) → sem menu de áreas; cada papel só vê o que pode */
  const nav = role
    ? NAV_ALL.filter((n) => (n.roles as readonly string[]).includes(role))
    : [];

  useEffect(() => {
    setMudo(!somLigado);
  }, [somLigado]);

  return (
    <div className="ops-shell relative min-h-dvh">
      {/* ambientes */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="glow-orb absolute -top-40 left-1/4 size-[34rem] bg-brand-500/6" />
        <div className="glow-orb absolute top-1/3 -right-40 size-[28rem] bg-amber-500/6" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(240,94,74,0.04),transparent_62%)]" />
      </div>

      {/* Marca d'água discreta do QR Admin */}
      <div
        aria-hidden="true"
        className="fixed -z-10 bottom-0 right-0 w-36 sm:w-52 h-80 opacity-[.045] pointer-events-none"
        style={{
          background:
            "url('/logo/qradmin-mark.png') center bottom / contain no-repeat",
        }}
      />
      {/* header */}
      <header className="ops-topbar sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-1.5 sm:gap-3 min-w-0">
          <aside className="ops-sidebar">
            <button
              onClick={() => {
                if (role === "admin") ir("/admin");
                else if (role === "cozinha") ir("/cozinha");
                else if (role === "bar") ir("/bar");
                else if (role === "caixa") ir("/caixa");
                else ir("/");
              }}
              className="ops-brand cursor-pointer shrink-0"
            >
              <Logo size="sm" />
            </button>
            <p className="ops-sidebar-label">Seu espaço de operação</p>
            <nav
              aria-label="Postos de operação"
              className="ops-nav flex items-center gap-0.5 sm:gap-1 rounded-full bg-slate-100/70 border border-slate-200 p-0.5 sm:p-1 overflow-x-auto no-scrollbar max-w-[55vw] sm:max-w-none shrink"
            >
              {nav.map((n) => (
                <button
                  key={n.id}
                  aria-label={n.label}
                  aria-current={ativo === n.id ? "page" : undefined}
                  onClick={() => ir(n.to)}
                  className={cn(
                    "ops-nav-item btn-press relative flex items-center gap-1.5 rounded-full px-3 sm:px-3.5 h-9 text-xs font-semibold cursor-pointer transition-colors",
                    ativo === n.id
                      ? "text-white"
                      : "text-slate-500 hover:text-navy-800",
                  )}
                >
                  {ativo === n.id && (
                    <motion.span
                      layoutId="ops-nav"
                      className="absolute inset-0 rounded-full fill-brand"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                      }}
                    />
                  )}
                  <n.icon className="relative z-10 size-4" />
                  <span className="ops-nav-label relative z-10 hidden lg:inline">
                    {n.label}
                  </span>
                </button>
              ))}
            </nav>

            <div className="ops-sidebar-footer">
              <LivePill />
              <p>
                Do pedido à mesa.
                <br />
                Tudo no mesmo lugar.
              </p>
            </div>
          </aside>
          <p className="ops-topbar-kicker hidden lg:block text-xs font-semibold text-slate-500">
            {kicker}
          </p>
          <div className="flex-1 min-w-0" />
          <ThemeToggle />
          <button
            onClick={toggleSom}
            title={
              somLigado ? "Silenciar alertas de voz" : "Ativar alertas de voz"
            }
            className={cn(
              "btn-press grid place-items-center size-10 rounded-full border cursor-pointer transition-colors",
              somLigado
                ? "bg-brand-500/10 border-brand-500/40 text-brand-600"
                : "bg-slate-100/70 border-slate-200 text-slate-500",
            )}
          >
            {somLigado ? (
              <Volume2 className="size-4.5" />
            ) : (
              <VolumeX className="size-4.5" />
            )}
          </button>
          <button
            onClick={() => {
              ir("/");
            }}
            title="Início"
            className="btn-press hidden sm:grid place-items-center size-10 rounded-full bg-slate-100/70 border border-slate-200 text-slate-500 hover:text-navy-800 cursor-pointer"
          >
            <House className="size-4.5" />
          </button>
          {role && (
            <button
              onClick={() => setTrocando(true)}
              title={role === "admin" ? "Redefinir senha de um setor" : "Alterar senha"}
              aria-label={role === "admin" ? "Redefinir senha de um setor" : "Alterar senha"}
              className="btn-press hidden sm:grid place-items-center size-10 rounded-full bg-slate-100/70 border border-slate-200 text-slate-500 hover:text-navy-800 cursor-pointer"
            >
              <KeyRound className="size-4.5" />
            </button>
          )}
          <button
            onClick={() => {
              logout();
              ir("/login");
            }}
            title="Sair"
            className="btn-press hidden sm:grid place-items-center size-10 rounded-full bg-slate-100/70 border border-slate-200 text-slate-500 hover:text-rose-600 cursor-pointer"
          >
            <LogOut className="size-4.5" />
          </button>
        </div>
      </header>

      <main className="ops-main mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10 pb-24">
        <div className="ops-page-heading flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-brand-600">
              {kicker}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.12] text-navy-900 mt-1 break-words">
              {titulo}
            </h1>
          </div>
          {extra}
        </div>
        {children}
      </main>
      {role && (trocaObrigatoria || trocando) && (
        <TrocarSenha
          obrigatorio={trocaObrigatoria}
          onClose={() => setTrocando(false)}
        />
      )}
    </div>
  );
}
