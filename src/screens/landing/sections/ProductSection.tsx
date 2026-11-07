import { useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { CapturaProduto } from "../components/ProductShots";
import { SectionIntro } from "../components/SectionIntro";

const demoViews = [
  {
    id: "gestao",
    label: "Visão da operação",
    note: "Dashboard administrativo do QR Admin, com indicadores do período.",
  },
  {
    id: "cardapio",
    label: "Cardápio do cliente",
    note: "Cardápio digital aberto pelo QR Code da mesa, no navegador do cliente.",
  },
] as const;

export function ProductSection() {
  const [activeView, setActiveView] = useState<string>(demoViews[0].id);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = demoViews.find((view) => view.id === activeView) ?? demoViews[0];

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = demoViews.length - 1;
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = index === lastIndex ? 0 : index + 1;
    if (event.key === "ArrowLeft") nextIndex = index === 0 ? lastIndex : index - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;
    if (nextIndex !== index) {
      event.preventDefault();
      const nextView = demoViews[nextIndex];
      setActiveView(nextView.id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <section className="product-section" id="produto" aria-labelledby="product-title">
      <div className="page-shell product-section__grid">
        <div className="product-section__copy">
          <SectionIntro eyebrow="POR DENTRO DA EXPERIÊNCIA" title="Uma plataforma, diferentes lados do balcão." light id="product-title">
            <p>Explore duas perspectivas da jornada: a organização da operação e o acesso do cliente ao cardápio.</p>
          </SectionIntro>
          <div className="demo-tabs" role="tablist" aria-label="Perspectiva da demonstração">
            {demoViews.map((view, index) => (
              <button
                className={`demo-tab${activeView === view.id ? " demo-tab--active" : ""}`}
                type="button"
                role="tab"
                id={`demo-tab-${view.id}`}
                aria-selected={activeView === view.id}
                aria-controls="demo-panel"
                tabIndex={activeView === view.id ? 0 : -1}
                key={view.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                onClick={() => setActiveView(view.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <span>{view.label}</span>
                <Icon name="arrow-up-right" size={15} />
              </button>
            ))}
          </div>
          <p className="product-section__tab-note" aria-live="polite">
            {active.note}
          </p>
          <div className="product-section__disclaimer">
            <Icon name="info" size={17} />
            <p>
              Capturas reais do sistema em ambiente de demonstração, com dados fictícios. Nenhuma
              informação de cliente é exibida.
            </p>
          </div>
        </div>

        <div className="product-section__visual">
          <div className="product-section__visual-head">
            <span>
              <i /> CAPTURA DO SISTEMA
            </span>
            <span>DADOS FICTÍCIOS</span>
          </div>
          <div
            className={`product-stage${activeView === "cardapio" ? " product-stage--menu" : ""}`}
            role="tabpanel"
            id="demo-panel"
            aria-labelledby={`demo-tab-${activeView}`}
            tabIndex={0}
          >
            {activeView === "gestao" ? (
              <div className="product-stage__dashboard">
                <CapturaProduto chave="dashboard" className="product-stage__shot" />
              </div>
            ) : (
              <div className="product-stage__phone">
                <CapturaProduto chave="cardapio" className="product-stage__shot product-stage__shot--phone" />
              </div>
            )}
            <div className="product-stage__caption">
              <span>{active.label}</span>
              <span>QRADMIN · SISTEMA EM OPERAÇÃO</span>
            </div>
          </div>
          <div className="product-section__visual-foot">
            <span>
              <Icon name="monitor" size={15} /> VISÃO ADMINISTRATIVA
            </span>
            <span>
              <Icon name="phone" size={15} /> EXPERIÊNCIA DO CLIENTE
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
