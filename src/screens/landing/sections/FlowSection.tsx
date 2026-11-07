import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";

const steps = [
  { number: "01", title: "Acessar", description: "O cliente lê o QR Code fixo da mesa e abre o cardápio digital.", icon: "qr", group: "NA MESA" },
  { number: "02", title: "Escolher", description: "Consulta os itens, personaliza o pedido e acompanha a comanda.", icon: "grid", group: "NA MESA" },
  { number: "03", title: "Encaminhar", description: "Cada item segue para a fila da cozinha ou do bar, conforme o setor.", icon: "receipt", group: "NA OPERAÇÃO" },
  { number: "04", title: "Preparar", description: "Os setores controlam item a item; o garçom é avisado quando fica pronto.", icon: "utensils", group: "NA OPERAÇÃO" },
  { number: "05", title: "Fechar", description: "O caixa divide a conta, registra pagamentos e gera o QR PIX.", icon: "wallet", group: "NO CAIXA" },
  { number: "06", title: "Acompanhar", description: "A administração consulta cardápio, estoque, equipe e indicadores.", icon: "chart", group: "NA GESTÃO" },
];

export function FlowSection() {
  return (
    <section className="flow-section" id="como-funciona" aria-labelledby="flow-title">
      <div className="page-shell">
        <div className="flow-section__heading">
          <SectionIntro eyebrow="UM FLUXO, DIFERENTES PONTOS DE CONTATO" title="Da escolha ao fechamento, etapa por etapa." id="flow-title">
            <p>
              Esta é a jornada que o QRAdmin implementa hoje: uma sequência única em que os
              contextos se encontram durante o serviço.
            </p>
          </SectionIntro>
          <p className="flow-section__stamp">
            <span>01 — 06</span>
            <br />
            FLUXO DO PRODUTO
            <br />
            EM OPERAÇÃO
          </p>
        </div>

        <ol className="flow-track">
          {steps.map((step) => (
            <li className="flow-step" key={step.number}>
              <span className="flow-step__group">{step.group}</span>
              <span className="flow-step__marker">
                <span>{step.number}</span>
                <Icon name={step.icon} size={19} />
              </span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
        <div className="flow-section__foot">
          <span className="flow-section__foot-line" />
          <p>
            <strong>Do QR ao caixa:</strong> o mesmo pedido atravessa mesa, produção, entrega e
            fechamento — sem retrabalho de digitação entre as etapas.
          </p>
        </div>
      </div>
    </section>
  );
}
