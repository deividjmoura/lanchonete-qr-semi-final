import { useReducedMotion } from "framer-motion";
import {
  BeerStein,
  CashRegister,
  ChartBar,
  CookingPot,
  ForkKnife,
  House,
  Key,
  List,
  QrCode,
  SignOut,
  SpeakerHigh,
  SpeakerSlash,
  SquaresFour,
  Users,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePub } from "../store/usePub";
import { ir } from "../router";
import { useDockMagnify } from "../hooks/useDockMagnify";
import { IconBtn, Logo, ThemeToggle } from "./ui";
import { TrocarSenha } from "./TrocarSenha";
import { audioMudo, beepAlerta, beepDuplo, falar, setMudo } from "../lib/sonus";
import { FRASES_GARCOM } from "../lib/data";
import "./OpsShell.css";

const NAV_ALL = [
  { id: "cozinha", label: "Cozinha", Icon: CookingPot, to: "/cozinha", roles: ["admin", "cozinha"] as const },
  { id: "bar", label: "Bar", Icon: BeerStein, to: "/bar", roles: ["admin", "bar"] as const },
  { id: "caixa", label: "Caixa", Icon: CashRegister, to: "/caixa", roles: ["admin", "caixa"] as const },
  { id: "admin-painel", label: "Dashboard", Icon: ChartBar, to: "/admin", roles: ["admin"] as const },
  { id: "admin-cardapio", label: "Cardápio", Icon: ForkKnife, to: "/admin/cardapio", roles: ["admin"] as const },
  { id: "admin-mesas", label: "Mesas", Icon: QrCode, to: "/admin/mesas", roles: ["admin"] as const },
  { id: "admin-garcons", label: "Garçons", Icon: Users, to: "/admin/garcons", roles: ["admin"] as const },
  { id: "admin-funcoes", label: "Funções", Icon: SquaresFour, to: "/admin/funcoes", roles: ["admin"] as const },
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
  toolbarAction,
  subhead,
  regime = "operational",
}: {
  ativo: string;
  children: ReactNode;
  titulo: ReactNode;
  kicker?: string;
  extra?: ReactNode;
  toolbarAction?: ReactNode;
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
  const [menuAberto, setMenuAberto] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const trocaObrigatoria = Boolean(auth?.deveTrocar);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (role) void hydrateMe();
  }, [role, hydrateMe]);

  const nav = role
    ? NAV_ALL.filter((n) => (n.roles as readonly string[]).includes(role))
    : [];
  const dock = useDockMagnify(nav.length, reduceMotion);
  const toolbarCount = 3 + (toolbarAction ? 1 : 0) + (role ? 1 : 0) + (role && role !== "admin" ? 1 : 0);
  const toolbarDock = useDockMagnify(toolbarCount, reduceMotion, "x");

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

  useEffect(() => {
    if (trocaObrigatoria || !temNav) setMenuAberto(false);
  }, [trocaObrigatoria, temNav]);

  const fecharMenu = () => {
    setMenuAberto(false);
    requestAnimationFrame(() => menuTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!menuAberto) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const botoes = () => Array.from(sidebar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).filter((botao) => botao.getClientRects().length > 0);
    botoes()[0]?.focus();
    const aoTeclar = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuAberto(false);
        requestAnimationFrame(() => menuTriggerRef.current?.focus());
      } else if (event.key === "Tab") {
        const itens = botoes();
        if (!itens.length) return;
        const primeiro = itens[0];
        const ultimo = itens[itens.length - 1];
        if (event.shiftKey && document.activeElement === primeiro) {
          event.preventDefault();
          ultimo.focus();
        } else if (!event.shiftKey && document.activeElement === ultimo) {
          event.preventDefault();
          primeiro.focus();
        }
      }
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const aoRedimensionar = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    desktop.addEventListener("change", aoRedimensionar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      desktop.removeEventListener("change", aoRedimensionar);
    };
  }, [menuAberto]);

  return (
    <div className="ops-shell" data-regime={regime} data-admin={ativo.startsWith("admin-") ? "true" : undefined}>
      {temNav && menuAberto && (
        <button type="button" className="ops-sidebar-backdrop" aria-label="Fechar menu" onClick={fecharMenu} />
      )}
      {temNav && (
        <aside
          id="ops-navigation"
          ref={sidebarRef}
          className="ops-sidebar"
          style={{ borderRight: 0 }}
          data-open={menuAberto ? "true" : "false"}
          role={menuAberto ? "dialog" : undefined}
          aria-modal={menuAberto ? true : undefined}
          aria-label="Navegação principal"
        >
          <div className="flex items-center gap-3 px-3.5 h-16 overflow-hidden">
            <button
              type="button"
              onClick={() => { irInicio(); if (menuAberto) fecharMenu(); }}
              aria-label="Início QR Admin"
              className="ops-brand flex items-center gap-3 text-left min-w-0 focus:outline-none"
            >
              <Logo size="sm" />
              <span className="ops-sidebar-label font-display text-lg font-bold tracking-tight text-sidebar-text">
                QR Admin
              </span>
            </button>
            <button type="button" className="ops-sidebar-close" aria-label="Fechar menu" onClick={fecharMenu}>
              <X size={20} />
            </button>
          </div>

          <nav
            aria-label="Navegação principal"
            className="ops-nav ops-nav-list flex-1"
            ref={dock.navListRef}
            onMouseMove={dock.onMouseMove}
            onMouseLeave={dock.onMouseLeave}
          >
            {nav.map((n, index) => {
              const active = ativo === n.id;
              const Icon = n.Icon;
              return (
                <button
                  key={n.id}
                  ref={dock.setItemRef(index)}
                  style={dock.itemStyle(index)}
                  type="button"
                  data-active={active ? "true" : "false"}
                  aria-label={n.label}
                  data-label={n.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => { ir(n.to); if (menuAberto) fecharMenu(); }}
                  className="ops-nav-item text-left"
                >
                  <Icon size={24} weight={active ? "fill" : "regular"} className="shrink-0" />
                  <span className="ops-sidebar-label">{n.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      )}

      <div className={temNav ? "ops-main flex flex-col" : "min-h-dvh flex flex-col"}>
        <header className="ops-topbar sticky top-0 z-30 bg-transparent">
          <div className="ops-header-layout w-full px-4 sm:px-6 xl:px-10 2xl:px-12 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              {temNav ? (
                <button
                  ref={menuTriggerRef}
                  type="button"
                  className="ops-menu-trigger"
                  aria-label="Abrir menu"
                  aria-controls="ops-navigation"
                  aria-expanded={menuAberto}
                  onClick={() => setMenuAberto(true)}
                >
                  <List size={22} />
                </button>
              ) : (
                <button type="button" onClick={irInicio} aria-label="Início QR Admin" className="shrink-0">
                  <Logo size="sm" />
                </button>
              )}
              <div className="min-w-0">
                {kicker && (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-ink">
                    {kicker}
                  </p>
                )}
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-text leading-tight mt-0.5 break-words">
                  {titulo}
                </h1>
              </div>
            </div>

            <div className="ops-header-actions flex flex-wrap items-center gap-2 ml-auto">
              {extra && <div className="flex flex-wrap items-center gap-1.5 mr-1">{extra}</div>}
              <nav
                className="ops-toolbar-dock"
                ref={toolbarDock.navListRef}
                onMouseMove={toolbarDock.onMouseMove}
                onMouseLeave={toolbarDock.onMouseLeave}
                aria-label="Ações rápidas"
              >
                <span className="ops-toolbar-dock-item" ref={toolbarDock.setItemRef(0)} style={toolbarDock.itemStyle(0)}><ThemeToggle /></span>
                {toolbarAction && <span className="ops-toolbar-dock-item" ref={toolbarDock.setItemRef(1)} style={toolbarDock.itemStyle(1)}>{toolbarAction}</span>}
                <span className="ops-toolbar-dock-item" ref={toolbarDock.setItemRef(toolbarAction ? 2 : 1)} style={toolbarDock.itemStyle(toolbarAction ? 2 : 1)}>
                  <IconBtn active={somLigado} label={somLigado ? "Silenciar alertas de voz" : "Ativar alertas de voz"} onClick={toggleSom}>
                    {somLigado ? <SpeakerHigh size={20} weight="fill" /> : <SpeakerSlash size={20} />}
                  </IconBtn>
                </span>
                <span className="ops-toolbar-dock-item" ref={toolbarDock.setItemRef(toolbarAction ? 3 : 2)} style={toolbarDock.itemStyle(toolbarAction ? 3 : 2)}>
                  <IconBtn label="Página inicial" onClick={() => ir("/")}><House size={20} /></IconBtn>
                </span>
                {role && role !== "admin" && <span className="ops-toolbar-dock-item" ref={toolbarDock.setItemRef(toolbarAction ? 4 : 3)} style={toolbarDock.itemStyle(toolbarAction ? 4 : 3)}>
                  <IconBtn label="Alterar senha" onClick={() => setTrocando(true)}><Key size={20} /></IconBtn>
                </span>}
                {role && <span className="ops-toolbar-dock-item" ref={toolbarDock.setItemRef(toolbarCount - 1)} style={toolbarDock.itemStyle(toolbarCount - 1)}>
                  <IconBtn label="Sair" onClick={() => { logout(); ir("/login"); }}><SignOut size={20} /></IconBtn>
                </span>}
              </nav>
            </div>
          </div>
          {subhead && (
            <div className="w-full px-4 sm:px-6 xl:px-10 2xl:px-12 pb-2.5">{subhead}</div>
          )}
        </header>

        <main className="anim-ticket w-full flex-none px-4 sm:px-6 xl:px-10 2xl:px-12 py-5 sm:py-6 pb-24 sm:pb-28">
          {children}
        </main>
      </div>

      {role && (trocaObrigatoria || trocando) && (
        <TrocarSenha obrigatorio={trocaObrigatoria} onClose={() => setTrocando(false)} />
      )}
    </div>
  );
}
