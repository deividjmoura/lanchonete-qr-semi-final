import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";

const valuePoints = [
  {
    number: "01",
    title: "Pedidos sem contexto",
    description:
      "Cada item tem setor, status e horário. Sem recados paralelos.",
    icon: "receipt",
  },
  {
    number: "02",
    title: "Mesas difíceis de ler",
    description:
      "Mesa, sessão e comanda juntas. Do QR até o fechamento.",
    icon: "table",
  },
  {
    number: "03",
    title: "Fechamento espalhado",
    description:
      "Pagamentos, histórico e formas de pagamento no mesmo lugar.",
    icon: "wallet",
  },
];

export function ValueSection() {
  return (
    <section className="value-section" id="proposta" aria-labelledby="value-title">
      <div className="page-shell value-section__grade">
        <SectionIntro
          eyebrow="A rotina, como ela é"
          title="A informação precisa acompanhar o ritmo do serviço."
          id="value-title"
        >
          <p>
            Quando atendimento, cozinha e caixa trabalham separados, o pedido perde continuidade.
          </p>
        </SectionIntro>
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
    </section>
  );
}
