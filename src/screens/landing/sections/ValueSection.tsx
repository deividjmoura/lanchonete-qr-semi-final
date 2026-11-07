import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";

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
  return (
    <section className="value-section" id="proposta" aria-labelledby="value-title">
      <div className="page-shell value-section__grid">
        <div className="value-section__intro">
          <SectionIntro eyebrow="A ROTINA, COMO ELA É" title="A informação precisa acompanhar o ritmo do serviço." id="value-title" light>
            <p>
              Quando atendimento, cozinha e caixa trabalham com contextos diferentes, o fluxo perde
              continuidade. O QRAdmin foi construído para manter esses pontos no mesmo percurso.
            </p>
          </SectionIntro>
          <div className="value-section__note">
            <span className="value-section__note-mark">/</span>
            <span>Uma visão de operação, não mais um lugar para procurar respostas.</span>
          </div>
        </div>
        <div className="value-list" aria-label="Desafios operacionais e resposta do produto">
          {valuePoints.map((point) => (
            <article className="value-row" key={point.number}>
              <span className="value-row__number">{point.number}</span>
              <span className="value-row__icon">
                <Icon name={point.icon} size={19} />
              </span>
              <div className="value-row__copy">
                <h3>{point.title}</h3>
                <p>{point.description}</p>
              </div>
              <Icon name="arrow-up-right" size={17} className="value-row__arrow" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
