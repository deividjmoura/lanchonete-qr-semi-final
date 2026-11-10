import type { MouseEvent } from "react";
import { AccessButton } from "../components/AccessButton";
import { Icon } from "../components/Icon";
import { useRolagemInterna } from "../useRolagemInterna";

export function FinalCta({ aoAbrirAcesso }: { aoAbrirAcesso: () => void }) {
  const rolar = useRolagemInterna();
  const aoExplorar = (event: MouseEvent<HTMLAnchorElement>) => rolar(event, "#funcionalidades");

  return (
    <section className="final-cta" aria-labelledby="final-cta-title">
      <div className="page-shell final-cta__grade">
        <div>
          <p className="estacao">
            <span className="estacao__no" aria-hidden="true" />
            QR Admin · gestão para alimentação
          </p>
          <h2 id="final-cta-title">
            Mais contexto para servir. <span className="grifo">Mais clareza</span> para gerir.
          </h2>
        </div>
        <div className="final-cta__lado">
          <p>Conheça o sistema em funcionamento e veja como ele se conecta à realidade da sua operação.</p>
          <div className="final-cta__acoes">
            <a className="botao botao--sinal" href="#funcionalidades" onClick={aoExplorar}>
              <span>Explorar os módulos</span>
              <Icon name="arrow-up" size={18} />
            </a>
            <AccessButton className="botao botao--sobre-tinta final-cta__access" onClick={aoAbrirAcesso} />
          </div>
        </div>
      </div>
    </section>
  );
}
