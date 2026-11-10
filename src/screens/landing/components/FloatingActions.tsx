import { useEffect, useState } from "react";
import { AccessButton } from "./AccessButton";
import { Icon } from "./Icon";
import { EMAIL_URL, whatsappLink } from "../contato";

/* Ações persistentes da landing.
 *
 * No desktop o cabeçalho é sticky e mantém "Acessar o sistema" à vista o tempo
 * todo. Abaixo de 960 px o CTA do cabeçalho dá lugar ao menu, então o acesso e
 * os dois canais de contato passam a acompanhar a rolagem em uma barra curta
 * no canto inferior: o botão de acesso e, ao lado, WhatsApp e e-mail em ícone.
 *
 * Aparece depois que o hero sai da tela e se recolhe quando o rodapé entra na
 * viewport — lá os mesmos destinos já estão à vista. */
export function FloatingActions({ aoAbrirAcesso }: { aoAbrirAcesso: () => void }) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    let quadro = 0;
    const avaliar = () => {
      quadro = 0;
      const rodape = document.querySelector(".site-footer");
      const rodapeNaTela = rodape ? rodape.getBoundingClientRect().top < window.innerHeight - 140 : false;
      setVisivel(window.scrollY > 420 && !rodapeNaTela);
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

  /* Recolhida, a barra sai do alcance do teclado e do leitor de tela. */
  const fora = visivel ? undefined : -1;

  return (
    <div
      className={`floating-actions${visivel ? " floating-actions--visible" : ""}`}
      data-visivel={visivel ? "true" : "false"}
      aria-hidden={visivel ? undefined : true}
    >
      <AccessButton className="floating-actions__access" onClick={aoAbrirAcesso} showIcon={false} tabIndex={fora}>
        Acessar
      </AccessButton>
      <a
        className="floating-actions__canal floating-actions__canal--whatsapp"
        href={whatsappLink()}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar pelo WhatsApp"
        title="WhatsApp"
        tabIndex={fora}
      >
        <Icon name="whatsapp" size={21} />
      </a>
      <a
        className="floating-actions__canal floating-actions__canal--email"
        href={EMAIL_URL}
        aria-label="Enviar e-mail"
        title="E-mail"
        tabIndex={fora}
      >
        <Icon name="mail" size={21} />
      </a>
    </div>
  );
}
