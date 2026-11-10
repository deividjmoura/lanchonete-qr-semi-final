import { SectionIntro } from "../components/SectionIntro";

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
    <section className="publico" id="para-quem" aria-labelledby="audience-title">
      <div className="page-shell publico__grade">
        <SectionIntro
          eyebrow="Para quem serve"
          title="Para casas em que o pedido passa por muitas mãos."
          id="audience-title"
        >
          <p>
            O QR Admin atende a operação diária de negócios de alimentação — do atendimento no
            salão ao trabalho de quem organiza a casa. Feito para rotinas reais de salão, balcão e
            cozinha, sem presumir um modelo único de atendimento.
          </p>
        </SectionIntro>
        <ul className="publico__lista" aria-label="Operações de alimentação atendidas">
          {audiences.map((audience, index) => (
            <li key={audience}>
              <span className="dado publico__numero">0{index + 1}</span>
              <span>{audience}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
