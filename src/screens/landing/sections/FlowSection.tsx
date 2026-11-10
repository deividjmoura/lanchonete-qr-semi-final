import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";

const steps = [
  { number: "01", group: "NA MESA", title: "O cliente abre a comanda", description: "A leitura do QR Code identifica a mesa e abre o cardápio digital no próprio celular.", image: "comanda-cliente.webp", alt: "Tela real da comanda do cliente no QR Admin, com dados fictícios.", icon: "qr" },
  { number: "02", group: "NA MESA", title: "Escolhe e confirma o pedido", description: "O cliente personaliza os itens, registra observações e envia o pedido para a operação.", image: "personalizacao-produto.webp", alt: "Tela real de personalização de produto e adicionais no QR Admin.", icon: "receipt" },
  { number: "03", group: "NA PRODUÇÃO", title: "Cada item segue para seu setor", description: "A comanda é distribuída entre as filas da cozinha e do bar, sem redigitação.", image: "fila-cozinha.webp", alt: "Fila real de produção da cozinha no QR Admin.", icon: "utensils" },
  { number: "04", group: "NA PRODUÇÃO", title: "Cozinha e bar atualizam o preparo", description: "Cada setor acompanha seus itens e avança os estados da produção em tempo real.", image: "fila-bar.webp", alt: "Fila real de produção do bar no QR Admin.", icon: "card" },
  { number: "05", group: "NO SALÃO", title: "O garçom acompanha a entrega", description: "Os itens prontos chegam ao fluxo de retirada e entrega, com acompanhamento da comanda.", image: "entregas-garcom.webp", alt: "Tela real de entregas do garçom no QR Admin.", icon: "users" },
  { number: "06", group: "NO CAIXA", title: "A conta é conferida e fechada", description: "O caixa consulta o consumo, registra pagamentos e conclui o fechamento da mesa.", image: "fechamento-caixa.webp", alt: "Tela real de fechamento de caixa do QR Admin.", icon: "wallet" },
  { number: "07", group: "NA GESTÃO", title: "A administração enxerga a operação", description: "O painel reúne os indicadores do período para acompanhar o movimento da casa.", image: "dashboard-admin.webp", alt: "Dashboard administrativo real do QR Admin com dados fictícios.", icon: "chart" },
  { number: "08", group: "NA GESTÃO", title: "Cadastros e salão ficam organizados", description: "Cardápio, produtos e mapa de mesas fazem parte da mesma rotina administrativa.", image: "gestao-cardapio.webp", alt: "Tela real de gestão de cardápio do QR Admin.", icon: "grid" },
] as const;

export function FlowSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [etapaAtiva, setEtapaAtiva] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    let frame = 0;
    const atualizar = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const percurso = rect.height + window.innerHeight * 0.4;
      const percorrido = Math.min(percurso, Math.max(0, window.innerHeight * 0.7 - rect.top));
      setProgresso(percurso > 0 ? percorrido / percurso : 0);
    };
    const agendar = () => {
      if (!frame) frame = window.requestAnimationFrame(atualizar);
    };
    atualizar();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    const observador = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const index = Number((entry.target as HTMLElement).dataset.stepIndex ?? 0);
          setEtapaAtiva(index);
        }
      }
    }, { rootMargin: "-38% 0px -38% 0px", threshold: 0 });
    section.querySelectorAll<HTMLElement>("[data-step-index]").forEach((step) => observador.observe(step));
    return () => {
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      if (frame) window.cancelAnimationFrame(frame);
      observador.disconnect();
    };
  }, []);

  return (
    <section ref={sectionRef} className="flow-section" id="como-funciona" aria-labelledby="flow-title">
      <div className="page-shell">
        <div className="flow-section__heading">
          <SectionIntro eyebrow="O CAMINHO DE UM PEDIDO" title="Da mesa à cozinha. Da cozinha ao caixa." id="flow-title">
            <p>Um único pedido atravessa a casa. Acompanhe cada etapa nas telas reais do QR Admin, da leitura do QR Code ao fechamento da comanda.</p>
          </SectionIntro>
          <p className="flow-section__stamp"><span>01 — 08</span><br />JORNADA DO PEDIDO<br />E DA GESTÃO</p>
        </div>

        <div className="flow-narrative" data-active-step={etapaAtiva}>
          <div className="flow-narrative__rail" aria-hidden="true">
            <svg viewBox="0 0 48 1000" preserveAspectRatio="none">
              <path className="flow-narrative__track" d="M24 0 V1000" pathLength="1000" />
              <path className="flow-narrative__progress" d="M24 0 V1000" pathLength="1000" style={{ strokeDashoffset: 1000 - progresso * 1000 }} />
            </svg>
          </div>
          <ol className="flow-scenes">
            {steps.map((step, index) => (
              <li className={`flow-scene${etapaAtiva === index ? " flow-scene--active" : ""}`} data-step-index={index} key={step.number}>
                <div className="flow-scene__copy">
                  <span className="flow-scene__marker"><span>{step.number}</span><Icon name={step.icon} size={17} /></span>
                  <p className="flow-scene__group">{step.group}</p>
                  <h3>{step.title}</h3>
                  <p className="flow-scene__description">{step.description}</p>
                </div>
                <figure className="flow-scene__visual">
                  <img src={`/assets/apresentacao/${step.image}`} alt={step.alt} width="1440" height="900" loading={index < 2 ? "eager" : "lazy"} decoding="async" />
                  <figcaption><span>QR ADMIN / TELA REAL</span><span>{step.number} — 08</span></figcaption>
                </figure>
              </li>
            ))}
          </ol>
        </div>
        <p className="flow-section__foot"><span className="flow-section__foot-line" /><span><strong>Uma operação conectada:</strong> pedido, produção, atendimento, caixa e gestão consultam a mesma comanda.</span></p>
      </div>
    </section>
  );
}
