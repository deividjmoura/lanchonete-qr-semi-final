import type { MouseEvent } from "react";
import { Captura } from "../components/Capturas";
import { Icon } from "../components/Icon";
import { useRolagemInterna } from "../useRolagemInterna";

/* As seis estações por onde um pedido passa. A mesma sequência organiza a
   narrativa de rolagem logo abaixo (FlowSection). */
const estacoes = [
  { numero: "01", nome: "Mesa", detalhe: "QR Code fixo" },
  { numero: "02", nome: "Pedido", detalhe: "Cardápio digital" },
  { numero: "03", nome: "Cozinha e bar", detalhe: "Fila por setor" },
  { numero: "04", nome: "Garçom", detalhe: "Retirada e entrega" },
  { numero: "05", nome: "Caixa", detalhe: "Conta e pagamento" },
  { numero: "06", nome: "Gestão", detalhe: "Cardápio, equipe e painel" },
];

export function Hero() {
  const rolar = useRolagemInterna();
  const aoClicar = (event: MouseEvent<HTMLAnchorElement>, href: string) => rolar(event, href);

  return (
    <section className="hero" id="inicio" aria-labelledby="hero-title">
      <div className="page-shell hero__grade">
        <div className="hero__texto">
          <p className="estacao">
            <span className="estacao__no" aria-hidden="true" />
            Gestão para operações de alimentação
          </p>
          <h1 id="hero-title">
            Quando o salão acelera, <span className="grifo">a gestão</span> precisa acompanhar.
          </h1>
          <p className="hero__lead">
            O QR Admin reúne cardápio por QR Code, filas de cozinha e bar, atendimento do garçom,
            caixa e administração em um único percurso — para restaurantes, lanchonetes e outras
            casas de alimentação. O cliente começa pelo QR Code fixo da sua mesa, sem instalar
            aplicativo.
          </p>
          <div className="hero__acoes">
            <a
              className="botao botao--primario"
              href="#como-funciona"
              onClick={(event) => aoClicar(event, "#como-funciona")}
            >
              <span>Ver o percurso do pedido</span>
              <Icon name="arrow-down" size={18} />
            </a>
            <a className="botao botao--contorno" href="#contato" onClick={(event) => aoClicar(event, "#contato")}>
              <span>Falar com a gente</span>
            </a>
          </div>
        </div>

        <figure className="hero-art">
          <div className="moldura hero-art__tela">
            <div className="moldura__topo">
              <span className="moldura__no" aria-hidden="true" />
              <span className="moldura__nome">Gestão · painel do período</span>
            </div>
            <Captura chave="dashboard-admin" carregamento="eager" className="moldura__imagem" />
          </div>
          <div className="moldura moldura--celular hero-art__celular">
            <Captura chave="entregas-garcom" carregamento="eager" className="moldura__imagem" />
          </div>
          <figcaption className="hero-art__legenda">
            Capturas reais do sistema em ambiente de demonstração, com dados fictícios.
          </figcaption>
        </figure>
      </div>

      <div className="page-shell">
        <ol className="hero__linha" aria-label="As seis estações do percurso de um pedido">
          {estacoes.map((estacao) => (
            <li className="hero__estacao" key={estacao.numero}>
              <span className="hero__estacao-no" aria-hidden="true" />
              <span className="dado hero__estacao-numero">{estacao.numero}</span>
              <strong>{estacao.nome}</strong>
              <span className="hero__estacao-detalhe">{estacao.detalhe}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
