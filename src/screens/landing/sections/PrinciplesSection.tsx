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
    <section className="principios" id="diferenciais" aria-labelledby="principles-title">
      <div className="page-shell">
        <SectionIntro
          eyebrow="Princípios do produto"
          title="Sem cifras de palco. Uma operação mais conectada."
          id="principles-title"
        >
          <p>
            O QR Admin não publica depoimentos, números de clientes ou resultados prometidos nesta
            página. O que está descrito aqui é o comportamento do sistema em uso.
          </p>
        </SectionIntro>
        <ul className="principios__lista">
          {principles.map((principle) => (
            <li className="principio" key={principle.number}>
              <span className="principio__topo">
                <span className="dado">{principle.number}</span>
                <Icon name={principle.icon} size={20} />
              </span>
              <h3>{principle.title}</h3>
              <p>{principle.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
