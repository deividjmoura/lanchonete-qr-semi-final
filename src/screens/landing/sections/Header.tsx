import { useEffect, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ThemeToggle } from "../../../components/ui";
import { AccessButton } from "../components/AccessButton";
import { Brand } from "../components/Brand";
import { useRolagemInterna } from "../useRolagemInterna";

const navigation = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#funcionalidades", label: "Módulos" },
  { href: "#para-quem", label: "Para quem é" },
  { href: "#contato", label: "Contato" },
];

export function Header({
  aberto,
  aoAbrirAcesso,
}: {
  aberto: boolean;
  aoAbrirAcesso: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const reduzirMovimento = useReducedMotion();
  const rolar = useRolagemInterna();

  useEffect(() => {
    if (aberto) setMenuOpen(false);
  }, [aberto]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      requestAnimationFrame(() => menuTriggerRef.current?.focus({ preventScroll: true }));
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 961px)");
    const fecharNoDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };
    desktop.addEventListener("change", fecharNoDesktop);
    return () => desktop.removeEventListener("change", fecharNoDesktop);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  const aoClicarInterno = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    const fecharFocoMobile = menuOpen;
    closeMenu();
    rolar(event, href);
    if (fecharFocoMobile) {
      requestAnimationFrame(() => menuTriggerRef.current?.focus({ preventScroll: true }));
    }
  };

  const abrirAcessoDoMenu = (event: MouseEvent<HTMLButtonElement>) => {
    closeMenu();
    aoAbrirAcesso();
    event.currentTarget.blur();
  };

  const navMotion = reduzirMovimento
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.2, 0, 0, 1] as const };

  return (
    <header className="site-header">
      <div className="site-header__inner page-shell">
        <Brand />

        <nav className="main-nav main-nav--desktop" aria-label="Navegação principal">
          {navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={(event) => aoClicarInterno(event, item.href)}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="site-header__actions">
          <ThemeToggle className="site-header__tema" />
          <AccessButton className="botao botao--primario botao--compacto header-access" onClick={aoAbrirAcesso} />
          <button
            ref={menuTriggerRef}
            className={`menu-toggle${menuOpen ? " menu-toggle--open" : ""}`}
            type="button"
            aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation-mobile"
            onClick={() => {
              if (!aberto) setMenuOpen((open) => !open);
            }}
            aria-disabled={aberto ? true : undefined}
            tabIndex={aberto ? -1 : undefined}
          >
            <span className="menu-toggle__line" aria-hidden="true" />
            <span className="menu-toggle__line" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        id="primary-navigation-mobile"
        className="main-nav__mobile-slot"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
      >
        <AnimatePresence initial={false}>
          {menuOpen && (
            <motion.nav
              className="main-nav main-nav--mobile"
              aria-label="Navegação principal"
              initial={reduzirMovimento ? false : { opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduzirMovimento ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={navMotion}
            >
              {navigation.map((item) => (
                <a key={item.href} href={item.href} onClick={(event) => aoClicarInterno(event, item.href)}>
                  {item.label}
                </a>
              ))}
              <AccessButton className="botao botao--primario main-nav__mobile-access" onClick={abrirAcessoDoMenu} />
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
