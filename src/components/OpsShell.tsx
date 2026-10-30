import { motion, useReducedMotion } from "framer-motion";
import {
  BeerStein,
  CashRegister,
  CookingPot,
  House,
  Key,
  SignOut,
  SpeakerHigh,
  SpeakerSlash,
  SquaresFour,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePub } from "../store/usePub";
import { ir } from "../router";
import { IconBtn, Logo, ThemeToggle } from "./ui";
import { TrocarSenha } from "./TrocarSenha";
import { audioMudo, beepAlerta, beepDuplo, falar, setMudo } from "../lib/sonus";
import { FRASES_GARCOM } from "../lib/data";

const NAV_ALL = [
  { id: "cozinha", label: "Cozinha", Icon: CookingPot, to: "/cozinha", roles: ["admin", "cozinha"] as const },
  { id: "bar", label: "Bar", Icon: BeerStein, to: "/bar", roles: ["admin", "bar"] as const },
  { id: "caixa", label: "Caixa", Icon: CashRegister, to: "/caixa", roles: ["admin", "caixa"] as const },
  { id: "admin", label: "Admin", Icon: SquaresFour, to: "/admin", roles: ["admin"] as const },
];

/* Anúncios por papel — preserva 100% os alertas de voz e beeps do sistema */
export function useAnuncios(papel: "cozinha" | "bar" | "garcom" | "caixa") {
  const eventos = usePub((s) => s.eventos);
  const visto = useRef<number | null>(null);
  useEffect(() => {
    if (visto.current === null) {
      visto.current = Math.max(0, ...eventos.map((e) => e.seq));
      return;
    }
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
  subhead,
  regime = "operational",
}: {
  ativo: string;
  children: ReactNode;
  titulo: ReactNode;
  kicker?: string;
  extra?: ReactNode;
  subhead?: ReactNode;
  regime?: "expressive" | "operational";
}) {
  const somLigado = usePub((s) => s.somLigado);
  const toggleSom = usePub((s) => s.toggleSom);
  const logout = usePub((s) => s.logout);
  const auth = usePub((s) => s.auth);
  const hydrateMe = usePub((s) => s.hydrateMe);
  const role = auth?.role || null;
  const [trocando, setTrocando] = useState(false);
  const trocaObrigatoria = Boolean(auth?.deveTrocar);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (role) void hydrateMe();
  }, [role, hydrateMe]);

  const nav = role
    ? NAV_ALL.filter((n) => (n.roles as readonly string[]).includes(role))
    : [];

  useEffect(() => {
    setMudo(!somLigado);
  }, [somLigado]);

  const irInicio = () => {
    if (role === "admin") ir("/admin");
    else if (role === "cozinha") ir("/cozinha");
    else if (role === "bar") ir("/bar");
    else if (role === "caixa") ir("/caixa");
    else ir("/");
  };

  const temNav = nav.length > 0;

  return (
    <div className="ops-shell" data-regime={regime}>
      {temNav && (
        <aside className="ops-sidebar" aria-label="Postos de operação">
          <div className="flex items-center gap-3 px-3.5 h-16 border-b border-sidebar-line overflow-hidden">
            <button
              type="button"
              onClick={irInicio}
              aria-label="Início QR Admin"
              className="ops-brand flex items-center gap-3 text-left min-w-0 focus:outline-none"
            >
              <Logo size="sm" />
              <span className="ops-sidebar-label font-display text-lg font-extrabold uppercase tracking-tight text-sidebar-text">
                QR Admin
              </span>
            </button>
          </div>

          <nav aria-label="Setores" className="ops-nav ops-nav-list flex-1">
            {nav.map((n) => {
              const active = ativo === n.id;
              const Icon = n.Icon;
              return (
                <button
                  key={n.id}
                  type="button"
                  data-active={active ? "true" : "false"}
                  aria-label={n.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => ir(n.to)}
                  className="ops-nav-item text-left"
                >
                  {active && (
                    <motion.span
                      layoutId="ops-active-rail"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 520, damping: 38, mass: 0.7 }
                      }
                      className="absolute left-0 top-2 bottom-2 w-1 bg-brand rounded-r-xs"
                      aria-hidden="true"
                    />
                  )}
                  <Icon size={20} weight={active ? "fill" : "regular"} className="shrink-0" />
                  <span className="ops-sidebar-label">{n.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      )}

      <div className={temNav ? "ops-main flex flex-col" : "min-h-dvh flex flex-col"}>
        <header className="ops-topbar sticky top-0 z-30 border-b border-line bg-surface">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <button
                type="button"
                onClick={irInicio}
                aria-label="Início QR Admin"
                className={temNav ? "lg:hidden shrink-0" : "shrink-0"}
              >
                <Logo size="sm" />
              </button>
              <div className="min-w-0">
                {kicker && (
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-ink">
                    {kicker}
                  </p>
                )}
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-text leading-none mt-0.5 break-words">
                  {titulo}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {extra && <div className="flex flex-wrap items-center gap-1.5 mr-1">{extra}</div>}
              <div className="flex items-center gap-1.5">
                <ThemeToggle />
                <IconBtn
                  active={somLigado}
                  label={somLigado ? "Silenciar alertas de voz" : "Ativar alertas de voz"}
                  onClick={toggleSom}
                >
                  {somLigado ? <SpeakerHigh size={18} weight="fill" /> : <SpeakerSlash size={18} />}
                </IconBtn>
                <IconBtn label="Página inicial" onClick={() => ir("/")}>
                  <House size={18} />
                </IconBtn>
                {role && (
                  <>
                    <IconBtn
                      label={role === "admin" ? "Redefinir senha de um setor" : "Alterar senha"}
                      onClick={() => setTrocando(true)}
                    >
                      <Key size={18} />
                    </IconBtn>
                    <IconBtn
                      label="Sair"
                      onClick={() => {
                        logout();
                        ir("/login");
                      }}
                    >
                      <SignOut size={18} />
                    </IconBtn>
                  </>
                )}
              </div>
            </div>
          </div>
          {subhead && (
            <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pb-2.5">{subhead}</div>
          )}
        </header>

        <main className="anim-ticket mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          {children}
        </main>
      </div>

      {temNav && (
        <nav
          aria-label="Setores mobile"
          className="ops-mobile-bar"
          style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        >
          {nav.map((n) => {
            const active = ativo === n.id;
            const Icon = n.Icon;
            return (
              <button
                key={n.id}
                type="button"
                data-active={active ? "true" : "false"}
                aria-current={active ? "page" : undefined}
                onClick={() => ir(n.to)}
                className="ops-mobile-link"
              >
                <Icon size={20} weight={active ? "fill" : "regular"} />
                <span>{n.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {role && (trocaObrigatoria || trocando) && (
        <TrocarSenha obrigatorio={trocaObrigatoria} onClose={() => setTrocando(false)} />
      )}
    </div>
  );
}
