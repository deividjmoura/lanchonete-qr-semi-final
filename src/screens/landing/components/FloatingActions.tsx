import { useEffect, useState, type MouseEvent } from "react";
import { AccessButton } from "./AccessButton";
import { Icon } from "./Icon";
import { useRolagemInterna } from "../useRolagemInterna";

/* Ações persistentes da landing.
 *
 * No desktop o cabeçalho já é sticky e mantém "Acessar o sistema" visível o
 * tempo todo. Abaixo de 960 px o CTA do cabeçalho dá lugar ao menu (para o
 * logotipo não disputar a linha em 320–390 px), então o acesso e o contato
 * passam a acompanhar a rolagem em um par discreto no canto inferior.
 *
 * Comportamento: aparece depois que o hero sai da tela e se recolhe quando o
 * rodapé entra na viewport — lá os dois mesmos destinos já estão à vista, e a
 * barra não deve cobrir o conteúdo do rodapé. */
export function FloatingActions({ aoAbrirAcesso }: { aoAbrirAcesso: () => void }) {
  const [visivel, setVisivel] = useState(false);
  const rolar = useRolagemInterna();

  useEffect(() => {
    let quadro = 0;
    const avaliar = () => {
      quadro = 0;
      const rolado = window.scrollY;
      const rodape = document.querySelector(".site-footer");
      const rodapeNaTela = rodape
        ? rodape.getBoundingClientRect().top < window.innerHeight - 140
        : false;
      setVisivel(rolado > 420 && !rodapeNaTela);
    };
    const agendar = () => {
      if (!quadro) quadro = window.requestAnimationFrame(avaliar);
    };
    avaliar();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      if (quadro) window.cancelAnimationFrame(quadro);
    };
  }, []);

  const irParaContato = (event: MouseEvent<HTMLAnchorElement>) => rolar(event, "#contato");

  return (
    <div
      className={`floating-actions${visivel ? " floating-actions--visible" : ""}`}
      data-visivel={visivel ? "true" : "false"}
    >
      <AccessButton className="floating-actions__access" onClick={aoAbrirAcesso} showIcon={false}>
        Acessar
      </AccessButton>
      <a className="floating-actions__contato" href="#contato" onClick={irParaContato}>
        <Icon name="whatsapp" size={17} />
        <span>Contate-nos</span>
      </a>
    </div>
  );
}
