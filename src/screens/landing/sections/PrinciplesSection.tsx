import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";

const principles = [
  { number: "01", icon: "layers", title: "Centralizar", text: "Atendimento, operação e administração no mesmo percurso de trabalho." },
  { number: "02", icon: "receipt", title: "Dar continuidade", text: "O pedido mantém o vínculo com as etapas anteriores e posteriores à cozinha." },
  { number: "03", icon: "wallet", title: "Organizar o fechamento", text: "Pagamentos parciais e histórico da operação no contexto do caixa." },
  { number: "04", icon: "chart", title: "Enxergar a rotina", text: "Indicadores gerenciais do período para apoiar a decisão do dia a dia." },
];

export function PrinciplesSection() {
  return (
    <section className="principles-section" id="diferenciais" aria-labelledby="principles-title">
      <div className="page-shell">
        <div className="principles-section__heading">
          <SectionIntro eyebrow="PRINCÍPIOS DO PRODUTO" title="Sem cifras de palco. Uma operação mais conectada." id="principles-title">
            <p>
              O QRAdmin não publica depoimentos, números de clientes ou resultados prometidos nesta
              página. O que está descrito aqui é o comportamento do sistema em uso.
            </p>
          </SectionIntro>
          <span className="principles-section__seal" aria-hidden="true">
            <span>QR</span>
            <span>ADMIN</span>
            <i />
          </span>
        </div>
        <div className="principle-list">
          {principles.map((principle) => (
            <article className="principle" key={principle.number}>
              <span className="principle__number">{principle.number}</span>
              <span className="principle__icon">
                <Icon name={principle.icon} size={20} />
              </span>
              <h3>{principle.title}</h3>
              <p>{principle.text}</p>
              <span className="principle__mark" aria-hidden="true">
                +
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
