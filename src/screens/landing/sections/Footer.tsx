import type { MouseEvent } from "react";
import { AccessButton } from "../components/AccessButton";
import { Brand } from "../components/Brand";
import { Icon } from "../components/Icon";
import { useRolagemInterna } from "../useRolagemInterna";
import { EMAIL_EXIBIDO, EMAIL_URL, whatsappLink } from "../contato";

const footerLinks = [
  { href: "#proposta", label: "Proposta" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#funcionalidades", label: "Módulos" },
  { href: "#para-quem", label: "Para quem é" },
  { href: "#contato", label: "Contate-nos" },
];

/* Páginas institucionais já publicadas pelo produto. Elas continuam servidas
   como arquivos estáticos em /guia-sistema.html e /apresentacao.html. */
const institutionalLinks = [
  { href: "/guia-sistema.html", label: "Guia do sistema" },
  { href: "/apresentacao.html", label: "Apresentação institucional" },
  { href: "/politica-de-privacidade.html", label: "Política de privacidade" },
  { href: "/termos-de-servico.html", label: "Termos de serviço" },
];

export function Footer({ aoAbrirAcesso }: { aoAbrirAcesso: () => void }) {
  const rolar = useRolagemInterna();
  const aoClicarInterno = (event: MouseEvent<HTMLAnchorElement>, href: string) => rolar(event, href);

  return (
    <footer className="site-footer">
      <div className="page-shell">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <Brand inverted />
            <p>Cardápio, atendimento, operação e administração no mesmo fluxo para negócios de alimentação.</p>
          </div>
          <div className="site-footer__nav-wrap">
            <p className="site-footer__label">NAVEGAÇÃO</p>
            <nav className="site-footer__nav" aria-label="Navegação do rodapé">
              {footerLinks.map((link) => (
                <a href={link.href} key={link.href} onClick={(event) => aoClicarInterno(event, link.href)}>
                  {link.label}
                </a>
              ))}
            </nav>
            <p className="site-footer__label site-footer__label--secondary">INSTITUCIONAL</p>
            <nav className="site-footer__nav" aria-label="Páginas institucionais">
              {institutionalLinks.map((link) => (
                <a href={link.href} key={link.href}>
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
          {/* Contate-nos fica ao lado do acesso: quem chega ao fim da página
              escolhe entre falar com o responsável e entrar no sistema. */}
          <div className="site-footer__contato">
            <p className="site-footer__label">CONTATE-NOS</p>
            <a
              className="site-footer__contato-link"
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="whatsapp" size={15} />
              WhatsApp
            </a>
            <a className="site-footer__contato-link" href={EMAIL_URL}>
              <Icon name="mail" size={15} />
              {EMAIL_EXIBIDO}
            </a>
            <a
              className="site-footer__contato-link"
              href="#contato"
              onClick={(event) => aoClicarInterno(event, "#contato")}
            >
              Ver formatos de adesão
            </a>
          </div>
          <div className="site-footer__access" id="acesso">
            <p className="site-footer__label">ACESSO AO SISTEMA</p>
            <AccessButton className="site-footer__access-link" onClick={aoAbrirAcesso}>
              Acessar QRAdmin
            </AccessButton>
            <span className="site-footer__access-hint">Equipe, cozinha, bar e caixa entram pelo mesmo acesso.</span>
          </div>
        </div>
        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} QRAdmin. Todos os direitos reservados.</span>
          <span className="site-footer__bottom-note">
            <Icon name="info" size={14} />
            Capturas do sistema em ambiente de demonstração, com dados fictícios.
          </span>
          <a
            href="#inicio"
            className="site-footer__back-top"
            onClick={(event) => {
              aoClicarInterno(event, "#inicio");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Voltar ao início <Icon name="arrow-up-right" size={15} />
          </a>
        </div>
      </div>
    </footer>
  );
}
