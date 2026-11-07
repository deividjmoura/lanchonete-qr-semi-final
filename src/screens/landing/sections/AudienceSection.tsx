import { SectionIntro } from "../components/SectionIntro";
import { Icon } from "../components/Icon";

const audiences = [
  "Restaurantes",
  "Lanchonetes",
  "Pizzarias",
  "Cafeterias",
  "Hamburguerias",
  "Pequenas e médias operações",
];

export function AudienceSection() {
  return (
    <section className="audience-section" id="para-quem" aria-labelledby="audience-title">
      <div className="page-shell audience-section__grid">
        <div className="audience-section__copy">
          <SectionIntro eyebrow="PARA QUEM SERVE" title="Para casas em que o pedido passa por muitas mãos." id="audience-title">
            <p>
              O QRAdmin atende a operação diária de negócios de alimentação — do atendimento no
              salão ao trabalho de quem organiza a casa.
            </p>
          </SectionIntro>
          <p className="audience-section__aside">
            <span>01 / PERFIL</span>Feito para rotinas reais de salão, balcão e cozinha — sem
            presumir um modelo único de atendimento.
          </p>
        </div>
        <div className="audience-list-wrap">
          <p className="audience-list-wrap__label">OPERAÇÕES DE ALIMENTAÇÃO</p>
          <ul className="audience-list">
            {audiences.map((audience, index) => (
              <li key={audience}>
                <span className="audience-list__number">0{index + 1}</span>
                <span>{audience}</span>
                <span className="audience-list__plus" aria-hidden="true">
                  <Icon name="arrow-up-right" size={15} />
                </span>
              </li>
            ))}
          </ul>
          <p className="audience-list-wrap__foot">Segmentos atendidos pelo produto em operação.</p>
        </div>
      </div>
    </section>
  );
}
