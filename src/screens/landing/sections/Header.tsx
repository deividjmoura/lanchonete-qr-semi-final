import { useEffect, useState, type MouseEvent } from "react";
import { AccessButton } from "../components/AccessButton";
import { Brand } from "../components/Brand";
import { Icon } from "../components/Icon";
import { useRolagemInterna } from "../useRolagemInterna";

const navigation = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#funcionalidades", label: "Módulos" },
  { href: "#para-quem", label: "Para quem é" },
];

export function Header({
  aberto,
  aoAbrirAcesso,
}: {
  aberto: boolean;
  aoAbrirAcesso: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rolar = useRolagemInterna();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  const aoClicarInterno = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    closeMenu();
    rolar(event, href);
  };

  const abrirAcessoDoMenu = (event: MouseEvent<HTMLButtonElement>) => {
    closeMenu();
    aoAbrirAcesso();
    event.currentTarget.blur();
  };

  return (
    <header className="site-header">
      <div className="site-header__inner page-shell">
        <Brand />

        <nav
          className={`main-nav${menuOpen ? " main-nav--open" : ""}`}
          aria-label="Navegação principal"
          id="primary-navigation"
        >
          {navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={(event) => aoClicarInterno(event, item.href)}>
              {item.label}
            </a>
          ))}
          <AccessButton className="main-nav__mobile-access" onClick={abrirAcessoDoMenu} />
        </nav>

        <div className="site-header__actions">
          <AccessButton className="header-access" onClick={aoAbrirAcesso} />
          <a
            className="button button--dark button--small"
            href="#produto"
            onClick={(event) => rolar(event, "#produto")}
          >
            <span className="site-header__button-label site-header__button-label--wide">Conhecer o produto</span>
            <span className="site-header__button-label site-header__button-label--compact">Ver produto</span>
            <Icon name="arrow-right" size={16} />
          </a>
        </div>

        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
          aria-disabled={aberto ? true : undefined}
          tabIndex={aberto ? -1 : undefined}
        >
          <Icon name={menuOpen ? "close" : "menu"} size={21} />
        </button>
      </div>
    </header>
  );
}
