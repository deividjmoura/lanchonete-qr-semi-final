import { useEffect, useRef, useState } from "react";

/* Narrativa de rolagem do percurso do pedido.
 *
 * Duas leituras da mesma posição de rolagem, medidas uma vez por quadro:
 *
 *  - `--percurso` (0 a 1), gravada direto no elemento do trilho: é o quanto da
 *    linha de passe já foi percorrido. O CSS usa a variável para esticar o
 *    traço aceso, então a linha acompanha a rolagem sem re-renderizar o React.
 *  - `ativa`: o índice da estação que cruzou o meio da tela por último. Só
 *    muda de valor quando a estação muda; é o que troca a cena do palco.
 *
 * Sem biblioteca e sem `animation-timeline` (ainda fora do Safari e do
 * Firefox): é um listener passivo de scroll com requestAnimationFrame. */
export function usePercurso<T extends HTMLElement>() {
  const trilho = useRef<T>(null);
  const [ativa, setAtiva] = useState(0);

  useEffect(() => {
    const elemento = trilho.current;
    if (!elemento) return;
    let quadro = 0;

    const medir = () => {
      quadro = 0;
      const meio = window.innerHeight * 0.5;
      const caixa = elemento.getBoundingClientRect();
      const percorrido = caixa.height > 0 ? (meio - caixa.top) / caixa.height : 0;
      elemento.style.setProperty("--percurso", Math.min(1, Math.max(0, percorrido)).toFixed(4));

      let indice = 0;
      elemento.querySelectorAll<HTMLElement>("[data-etapa]").forEach((etapa, i) => {
        if (etapa.getBoundingClientRect().top <= meio) indice = i;
      });
      setAtiva((atual) => (atual === indice ? atual : indice));
    };
    const agendar = () => {
      if (!quadro) quadro = window.requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      if (quadro) window.cancelAnimationFrame(quadro);
    };
  }, []);

  return { trilho, ativa };
}
