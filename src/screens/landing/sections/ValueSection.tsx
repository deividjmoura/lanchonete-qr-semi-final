import type { MouseEvent } from "react";
import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";
import { useRolagemInterna } from "../useRolagemInterna";

const valuePoints = [
  {
    number: "01",
    title: "Pedidos sem contexto",
    description:
      "Cada item tem setor, status e horário próprios: cozinha e bar trabalham sobre o mesmo pedido, sem recados paralelos.",
    icon: "receipt",
  },
  {
    number: "02",
    title: "Mesas difíceis de ler",
    description:
      "Mesa, sessão e comanda aparecem juntas no mapa do salão — do QR de entrada ao fechamento no caixa.",
    icon: "table",
  },
  {
    number: "03",
    title: "Fechamento espalhado",
    description:
      "Caixa, pagamentos parciais e histórico de vendas ficam no mesmo lugar, com o registro de cada forma de pagamento.",
    icon: "wallet",
  },
];

export function ValueSection() {
  const rolar = useRolagemInterna();
  const aoClicar = (event: MouseEvent<HTMLAnchorElement>, href: string) => rolar(event, href);

  return (
    <section className="value-section" id="proposta" aria-labelledby="value-title">
      <div className="page-shell">
        <div className="value-section__masthead">
          <div className="value-section__identity">
            <img src="/logo/simbolo-96.png" alt="" aria-hidden="true" width="48" height="48" />
            <p className="value-section__assinatura">
              <span>PASSE</span>
              <span className="value-section__assinatura-divisor" aria-hidden="true">
                /
              </span>
              <span>QR ADMIN</span>
            </p>
          </div>
          <div className="value-section__divider" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="value-section__grade">
          <div className="value-section__intro">
            <SectionIntro
              eyebrow="A rotina, como ela é"
              title="A informação precisa acompanhar o ritmo do serviço."
              id="value-title"
            >
              <p>
                Quando atendimento, cozinha e caixa trabalham com contextos diferentes, o pedido perde
                continuidade. O QR Admin foi construído para manter esses pontos no mesmo percurso.
              </p>
            </SectionIntro>
            <div className="value-section__acoes">
              <a
                className="botao botao--primario"
                href="#como-funciona"
                onClick={(event) => aoClicar(event, "#como-funciona")}
              >
                <span>Ver o percurso</span>
                <Icon name="arrow-down" size={18} />
              </a>
              <a
                className="botao botao--contorno"
                href="#contato"
                onClick={(event) => aoClicar(event, "#contato")}
              >
                <span>Falar com a gente</span>
              </a>
            </div>
          </div>

          <ol className="value-list" aria-label="Desafios da operação e resposta do produto">
            {valuePoints.map((point) => (
              <li className="value-row" key={point.number}>
                <span className="dado value-row__numero">{point.number}</span>
                <span className="value-row__icone">
                  <Icon name={point.icon} size={20} />
                </span>
                <div className="value-row__texto">
                  <h3>{point.title}</h3>
                  <p>{point.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
