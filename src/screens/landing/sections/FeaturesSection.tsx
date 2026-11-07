import { useState } from "react";
import { BrandMark } from "../components/Brand";
import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";

type Recurso = {
  id: string;
  label: string;
  kicker: string;
  title: string;
  description: string;
  rows: { icon: string; title: string; detail: string }[];
  connected: string[];
};

const capabilities: Recurso[] = [
  {
    id: "atendimento",
    label: "Atendimento",
    kicker: "01 / SALÃO",
    title: "Do QR à mesa.",
    description:
      "Cardápio digital por QR Code, mesas com sessão própria, personalização de itens e acompanhamento da comanda pelo cliente.",
    rows: [
      { icon: "qr", title: "Cardápio do cliente", detail: "Acesso pelo QR fixo da mesa" },
      { icon: "table", title: "Mesa e sessão", detail: "Mapa do salão e check-in" },
      { icon: "receipt", title: "Pedido", detail: "Itens, adicionais e observações" },
    ],
    connected: ["Cardápio", "Mesa", "Pedido"],
  },
  {
    id: "operacao",
    label: "Operação",
    kicker: "02 / SERVIÇO",
    title: "Do pedido à entrega.",
    description:
      "Fila de produção separada por cozinha e bar, controle item a item, aviso por voz, impressão térmica e entregas do garçom.",
    rows: [
      { icon: "receipt", title: "Fila por setor", detail: "Cozinha e bar em tempo real" },
      { icon: "utensils", title: "Produção por item", detail: "Avanço parcial de cada prato" },
      { icon: "check", title: "Entregas do garçom", detail: "Pronto, retirado e entregue" },
    ],
    connected: ["Cozinha", "Bar", "Garçom"],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    kicker: "03 / FECHAMENTO",
    title: "Uma conta que fecha com contexto.",
    description:
      "Caixa com divisão de conta, pagamentos parciais, dinheiro, cartão e PIX com confirmação, comprovantes e histórico de vendas.",
    rows: [
      { icon: "wallet", title: "Fechamento da conta", detail: "Registro por forma de pagamento" },
      { icon: "card", title: "PIX com valor exato", detail: "Aviso do cliente e confirmação no caixa" },
      { icon: "receipt", title: "Histórico de vendas", detail: "Consulta e reimpressão" },
    ],
    connected: ["Conta", "Pagamento", "Histórico"],
  },
  {
    id: "gestao",
    label: "Administração",
    kicker: "04 / GESTÃO",
    title: "Cadastros para organizar a casa.",
    description:
      "Cardápio com fotos, categorias e adicionais, controle de estoque, praças do salão, contas de funcionários e indicadores gerenciais.",
    rows: [
      { icon: "box", title: "Cardápio e estoque", detail: "Produtos, categorias e adicionais" },
      { icon: "users", title: "Equipe", detail: "Contas por setor e segundo fator" },
      { icon: "chart", title: "Indicadores", detail: "Painel gerencial do período" },
    ],
    connected: ["Catálogo", "Equipe", "Gestão"],
  },
];

function FeatureStage({ capability }: { capability: Recurso }) {
  return (
    <div className="feature-stage" aria-live="polite" aria-atomic="true">
      <div className="feature-stage__topline">
        <span>
          <BrandMark size={22} /> QRADMIN / MÓDULOS
        </span>
        <span className="feature-stage__concept">
          <i /> EM PRODUÇÃO
        </span>
      </div>
      <div className="feature-stage__heading">
        <div>
          <span className="feature-stage__kicker">{capability.kicker}</span>
          <h3>{capability.title}</h3>
        </div>
        <span className="feature-stage__index">0{capabilities.findIndex((item) => item.id === capability.id) + 1}</span>
      </div>
      <div className="feature-stage__body">
        <div className="feature-stage__rows">
          {capability.rows.map((row) => (
            <div className="feature-stage__row" key={row.title}>
              <span className="feature-stage__row-icon">
                <Icon name={row.icon} size={17} />
              </span>
              <span className="feature-stage__row-copy">
                <strong>{row.title}</strong>
                <small>{row.detail}</small>
              </span>
              <Icon className="feature-stage__row-arrow" name="arrow-up-right" size={15} />
            </div>
          ))}
        </div>
        <div className="feature-stage__connections">
          <span className="feature-stage__connections-label">PONTOS RELACIONADOS</span>
          {capability.connected.map((item, index) => (
            <div className="feature-stage__connection" key={item}>
              <span className="feature-stage__connection-number">0{index + 1}</span>
              <span>{item}</span>
              {index < capability.connected.length - 1 && <span className="feature-stage__connection-line" />}
            </div>
          ))}
          <span className="feature-stage__connections-foot">
            Recurso do produto,
            <br />
            não de outra plataforma.
          </span>
        </div>
      </div>
      <div className="feature-stage__bottom">
        <span>QRADMIN · MÓDULOS DO SISTEMA</span>
        <span>VERIFICADO NO CÓDIGO</span>
      </div>
    </div>
  );
}

export function FeaturesSection() {
  const [activeId, setActiveId] = useState(capabilities[0].id);
  const activeCapability = capabilities.find((item) => item.id === activeId) ?? capabilities[0];

  return (
    <section className="features-section" id="funcionalidades" aria-labelledby="features-title">
      <div className="page-shell">
        <div className="features-section__heading">
          <SectionIntro eyebrow="RECURSOS POR CONTEXTO DE TRABALHO" title="Não são módulos soltos. São momentos da mesma operação." id="features-title">
            <p>
              Explore os grupos de recursos do QRAdmin, da chegada do cliente à visão
              administrativa.
            </p>
          </SectionIntro>
          <div className="scope-notice" role="note">
            <Icon name="info" size={19} />
            <div>
              <strong>Funcionalidades implementadas · operação de demonstração</strong>
              <p>
                Os recursos abaixo existem no produto e estão disponíveis no ambiente de
                demonstração. A conta usada nas capturas contém apenas dados fictícios.
              </p>
            </div>
          </div>
        </div>

        <div className="feature-explorer">
          <div className="feature-explorer__menu" aria-label="Escolha um contexto operacional">
            <p className="feature-explorer__menu-label">EXPLORE POR CONTEXTO</p>
            {capabilities.map((capability) => (
              <button
                className={`feature-picker${activeId === capability.id ? " feature-picker--active" : ""}`}
                type="button"
                key={capability.id}
                aria-pressed={activeId === capability.id}
                aria-controls="feature-stage"
                onClick={() => setActiveId(capability.id)}
              >
                <span className="feature-picker__index">{capability.kicker}</span>
                <span className="feature-picker__main">
                  <strong>{capability.label}</strong>
                  <Icon name="arrow-up-right" size={16} />
                </span>
                <span className="feature-picker__summary">{capability.title}</span>
              </button>
            ))}
            <p className="feature-explorer__menu-foot">Selecione um momento da rotina para ver os recursos relacionados.</p>
          </div>

          <div id="feature-stage" className="feature-explorer__stage">
            <FeatureStage capability={activeCapability} />
          </div>
        </div>

        <div className="features-section__list-note">
          <span className="features-section__list-rule" />
          <p>
            Os nomes acima seguem as telas do sistema. Para o detalhamento de cada área, consulte o{" "}
            <a className="features-section__link" href="/guia-sistema.html">
              guia do sistema
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
