import type { MouseEvent } from "react";
import { ArrowLink } from "../components/ArrowLink";
import { Icon } from "../components/Icon";
import { CapturaProduto } from "../components/ProductShots";
import { useRolagemInterna } from "../useRolagemInterna";

export function Hero() {
  const rolar = useRolagemInterna();
  const aoClicar = (event: MouseEvent<HTMLAnchorElement>, href: string) => rolar(event, href);

  return (
    <section className="hero" id="inicio" aria-labelledby="hero-title">
      <div className="page-shell hero__grid">
        <div className="hero__copy">
          <p className="eyebrow">
            <span className="eyebrow-rule" />
            GESTÃO PARA OPERAÇÕES DE ALIMENTAÇÃO
          </p>
          <h1 id="hero-title">
            Quando o salão acelera, <em>a gestão</em> precisa acompanhar.
          </h1>
          <p className="hero__lead">
            QRAdmin reúne cardápio por QR Code, filas de cozinha e bar, atendimento do garçom,
            caixa e administração em um único fluxo — para restaurantes, lanchonetes e outras
            casas de alimentação. O cliente começa pelo QR Code fixo da sua mesa, sem instalar
            aplicativo.
          </p>
          <div className="hero__actions">
            <a className="button button--accent" href="#como-funciona" onClick={(event) => aoClicar(event, "#como-funciona")}>
              <span>Entenda o fluxo</span>
              <Icon name="arrow-right" size={17} />
            </a>
            <ArrowLink href="#produto" onClick={(event) => aoClicar(event, "#produto")}>
              Explore a demonstração
            </ArrowLink>
          </div>
          <div className="hero__footnote">
            <span className="hero__footnote-index">
              01 <span>/</span> 06
            </span>
            <span className="hero__footnote-rule" />
            <span>Do cardápio ao fechamento, com contexto em cada etapa.</span>
          </div>
        </div>

        <figure className="hero-art" aria-label="Telas reais do QR Admin usadas neste site">
          <div className="hero-art__orbit hero-art__orbit--one" aria-hidden="true" />
          <div className="hero-art__orbit hero-art__orbit--two" aria-hidden="true" />
          <div className="hero-art__label">
            <span className="hero-art__label-dot" />
            CAPTURA DO SISTEMA <span>·</span> AMBIENTE DE DEMONSTRAÇÃO
          </div>
          <div className="hero-art__dashboard">
            <CapturaProduto chave="dashboard" carregamento="eager" className="hero-art__shot" />
          </div>
          <div className="hero-art__phone">
            <CapturaProduto chave="cardapio" carregamento="eager" className="hero-art__shot hero-art__shot--phone" />
          </div>
          <div className="hero-art__annotation" aria-hidden="true">
            <span className="hero-art__annotation-icon">
              <Icon name="qr" size={17} />
            </span>
            <span>
              <strong>Uma jornada conectada</strong>
              <small>salão · cozinha · gestão</small>
            </span>
          </div>
          <figcaption className="sr-only">
            Duas telas reais do QR Admin: o dashboard administrativo e o cardápio digital aberto
            pelo QR Code da mesa. As imagens foram capturadas em ambiente de demonstração, com
            dados fictícios, e não expõem informação de clientes.
          </figcaption>
          <div className="hero-art__caption" aria-hidden="true">
            <span>CAPTURAS DO SISTEMA</span>
            <span>01—02</span>
          </div>
        </figure>
      </div>
      <div className="hero__bottom page-shell" aria-hidden="true">
        <span>UMA VISÃO MAIS CONTÍNUA DA ROTINA</span>
        <span className="hero__bottom-rule" />
        <span>
          SCROLL PARA EXPLORAR <Icon name="arrow-down" size={14} />
        </span>
      </div>
    </section>
  );
}
