import type { MouseEvent } from "react";
import { AccessButton } from "../components/AccessButton";
import { LogoOficial } from "../components/Brand";
import { Icon } from "../components/Icon";
import { useRolagemInterna } from "../useRolagemInterna";
import { EMAIL_DOMINIO, EMAIL_EXIBIDO, EMAIL_URL, EMAIL_USUARIO, whatsappLink } from "../contato";

const footerLinks = [
  { href: "#proposta", label: "Proposta" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#funcionalidades", label: "Módulos" },
  { href: "#para-quem", label: "Para quem é" },
  { href: "#contato", label: "Contato" },
];

/* Páginas públicas já publicadas pelo produto; os guias continuam estáticos
   e a apresentação mantém o conteúdo institucional existente. */
const institutionalLinks = [
  { href: "/guia-sistema.html", label: "Guia do sistema" },
  { href: "/guia-sistema.html#acesso", label: "Acesso ao sistema" },
  { href: "/guia-sistema.html#uso", label: "Como usar" },
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
            <LogoOficial size={72} />
            <p className="site-footer__nome">
              <b>QR</b>Admin
            </p>
            <p>Cardápio, atendimento, operação e administração no mesmo percurso para negócios de alimentação.</p>
          </div>

          <div className="site-footer__coluna">
            <p className="site-footer__label">Navegação</p>
            <nav className="site-footer__nav" aria-label="Navegação do rodapé">
              {footerLinks.map((link) => (
                <a href={link.href} key={link.href} onClick={(event) => aoClicarInterno(event, link.href)}>
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="site-footer__coluna">
            <p className="site-footer__label">Guias e institucional</p>
            <nav className="site-footer__nav" aria-label="Guias e páginas institucionais">
              {institutionalLinks.map((link) => (
                <a href={link.href} key={link.href}>
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="site-footer__contato">
            <p className="site-footer__label">Contato</p>
            <div className="site-footer__canais">
              <a
                className="site-footer__contato-link"
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Falar pelo WhatsApp"
                title="WhatsApp"
              >
                <Icon name="whatsapp" size={22} />
              </a>
              <a
                className="site-footer__contato-link"
                href={EMAIL_URL}
                aria-label={`Enviar e-mail para ${EMAIL_EXIBIDO}`}
                title="E-mail"
              >
                <Icon name="mail" size={22} />
              </a>
            </div>
            <a className="site-footer__email" href={EMAIL_URL}>
              {EMAIL_USUARIO}@<wbr />
              {EMAIL_DOMINIO}
            </a>
          </div>

          <div className="site-footer__access" id="acesso">
            <p className="site-footer__label">Acesso da equipe</p>
            <AccessButton className="botao botao--sinal site-footer__access-link" onClick={aoAbrirAcesso}>
              Acessar QR Admin
            </AccessButton>
            <span className="site-footer__access-hint">O acesso abre a autenticação real do sistema para a equipe cadastrada.</span>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} QR Admin. Todos os direitos reservados.</span>
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
            Voltar ao início <Icon name="arrow-up" size={15} />
          </a>
        </div>
      </div>
    </footer>
  );
}
