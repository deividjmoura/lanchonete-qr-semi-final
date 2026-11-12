import { useEffect, useState, type MouseEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Captura, type CapturaChave } from "../components/Capturas";
import { SectionIntro } from "../components/SectionIntro";
import { usePercurso } from "../usePercurso";
import { useRolagemInterna } from "../useRolagemInterna";

/* O percurso de um pedido, estação por estação. A linha de passe conserva o
   progresso medido por usePercurso; o observador sincroniza a navegação e a
   captura ativa sem depender da frequência dos eventos de scroll. */
const etapas: {
  numero: string;
  estacao: string;
  titulo: string;
  texto: string;
  captura: CapturaChave;
  tela: string;
}[] = [
  {
    numero: "01",
    estacao: "Na mesa",
    titulo: "Acessar",
    texto: "O cliente lê o QR Code fixo da mesa e abre o cardápio digital, sem instalar aplicativo.",
    captura: "cardapio-cliente",
    tela: "Cardápio do cliente",
  },
  {
    numero: "02",
    estacao: "Na mesa",
    titulo: "Escolher",
    texto: "Consulta os itens, personaliza o pedido e acompanha a comanda.",
    captura: "personalizacao-produto",
    tela: "Personalização do item",
  },
  {
    numero: "03",
    estacao: "Na produção",
    titulo: "Encaminhar",
    texto: "Cada item segue para a fila da cozinha ou do bar, conforme o setor.",
    captura: "fila-cozinha",
    tela: "Fila da cozinha",
  },
  {
    numero: "04",
    estacao: "Na produção",
    titulo: "Preparar e entregar",
    texto: "Os setores controlam item a item; o garçom é avisado quando fica pronto.",
    captura: "entregas-garcom",
    tela: "Entregas do garçom",
  },
  {
    numero: "05",
    estacao: "No caixa",
    titulo: "Fechar",
    texto: "O caixa divide a conta, registra pagamentos e gera o QR PIX.",
    captura: "fechamento-caixa",
    tela: "Fechamento de contas",
  },
  {
    numero: "06",
    estacao: "Na gestão",
    titulo: "Acompanhar",
    texto: "A administração consulta cardápio, estoque, equipe e indicadores.",
    captura: "dashboard-admin",
    tela: "Painel do período",
  },
];

export function FlowSection() {
  const { trilho, ativa: ativaPorRolagem } = usePercurso<HTMLOListElement>();
  const [ativaObservada, setAtivaObservada] = useState<number | null>(null);
  const reduzirMovimento = useReducedMotion();
  const rolar = useRolagemInterna();
  const ativa = ativaObservada ?? ativaPorRolagem;
  const atual = etapas[ativa] ?? etapas[0];

  useEffect(() => {
    const lista = trilho.current;
    if (!lista || !("IntersectionObserver" in window)) return;

    const alvos = [...lista.querySelectorAll<HTMLElement>("[data-etapa]")];
    const intersectando = new Set<HTMLElement>();
    let observador: IntersectionObserver | undefined;

    const observar = () => {
      observador?.disconnect();
      intersectando.clear();
      const margem = Math.round(window.innerHeight * 0.41);
      observador = new IntersectionObserver(
        (entradas) => {
          for (const entrada of entradas) {
            const alvo = entrada.target as HTMLElement;
            if (entrada.isIntersecting) intersectando.add(alvo);
            else intersectando.delete(alvo);
          }

          const maisProxima = [...intersectando].sort(
            (a, b) =>
              Math.abs(a.getBoundingClientRect().top - window.innerHeight * 0.5) -
              Math.abs(b.getBoundingClientRect().top - window.innerHeight * 0.5),
          )[0];
          if (!maisProxima) return;

          const indice = Number(maisProxima.dataset.indice);
          if (Number.isInteger(indice)) setAtivaObservada(indice);
        },
        { rootMargin: `-${margem}px 0px -${margem}px 0px`, threshold: 0 },
      );
      alvos.forEach((alvo) => observador?.observe(alvo));
    };

    observar();
    window.addEventListener("resize", observar);
    return () => {
      window.removeEventListener("resize", observar);
      observador?.disconnect();
    };
  }, [trilho]);

  const aoClicarNaEstacao = (event: MouseEvent<HTMLAnchorElement>, href: string) => rolar(event, href);

  return (
    <section className="percurso" id="como-funciona" aria-labelledby="flow-title">
      <div className="page-shell">
        <SectionIntro
          eyebrow="Um percurso, seis estações"
          title="Da escolha ao fechamento, o mesmo pedido."
          id="flow-title"
        >
          <p>
            Esta é a jornada que o QR Admin implementa hoje: o pedido nasce na mesa e atravessa
            produção, entrega e caixa sem ser digitado de novo em nenhuma etapa.
          </p>
        </SectionIntro>

        <nav className="percurso__navegacao" aria-label="Navegação pelas estações do pedido">
          <ol>
            {etapas.map((etapa, indice) => {
              const href = `#percurso-etapa-${etapa.numero}`;
              return (
                <li key={etapa.numero}>
                  <a
                    href={href}
                    aria-label={`Ir para a estação ${etapa.numero}: ${etapa.titulo}`}
                    aria-current={indice === ativa ? "step" : undefined}
                    onClick={(event) => aoClicarNaEstacao(event, href)}
                  >
                    <span className="percurso__navegacao-numero">{etapa.numero}</span>
                    <span className="percurso__navegacao-titulo">{etapa.titulo}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="percurso__grade">
          <ol className="percurso__trilho" ref={trilho}>
            {etapas.map((etapa, indice) => (
              <motion.li
                className="percurso__etapa"
                key={etapa.numero}
                id={`percurso-etapa-${etapa.numero}`}
                data-etapa={etapa.numero}
                data-indice={indice}
                data-estado={indice < ativa ? "feita" : indice === ativa ? "ativa" : "adiante"}
                aria-labelledby={`percurso-titulo-${etapa.numero}`}
                initial={reduzirMovimento ? false : { opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.12 }}
                transition={{ duration: reduzirMovimento ? 0 : 0.38, ease: [0.2, 0, 0, 1] }}
              >
                <span className="percurso__no" aria-hidden="true" />
                <p className="percurso__estacao">
                  <span className="dado">{etapa.numero}</span>
                  {etapa.estacao}
                </p>
                <h3 id={`percurso-titulo-${etapa.numero}`}>{etapa.titulo}</h3>
                <p className="percurso__texto">{etapa.texto}</p>
                <figure
                  className="percurso__figura"
                  data-formato={etapa.captura === "entregas-garcom" ? "celular" : "tela"}
                >
                  <Captura chave={etapa.captura} className="percurso__figura-imagem" />
                  <figcaption>{etapa.tela}</figcaption>
                </figure>
              </motion.li>
            ))}
          </ol>

          <div className="percurso__palco">
            <div className="moldura moldura--tinta">
              <div className="moldura__topo">
                <span className="placa" data-tamanho="p">
                  <span className="placa__rotulo">Etapa</span>
                  <span className="placa__numero">{atual.numero}</span>
                </span>
                <span className="moldura__nome">
                  <small>{atual.estacao}</small>
                  {atual.tela}
                </span>
                <span className="dado percurso__conta" aria-hidden="true">
                  {atual.numero} / 0{etapas.length}
                </span>
              </div>
              <div className="percurso__cenas">
                {etapas.map((etapa, indice) => (
                  <Captura
                    key={etapa.numero}
                    chave={etapa.captura}
                    className="percurso__cena"
                    oculta={indice !== ativa}
                    carregamento={indice === 0 ? "eager" : "lazy"}
                  />
                ))}
              </div>
            </div>
            <p className="percurso__nota">
              Capturas reais do sistema em ambiente de demonstração, com dados fictícios. Nenhuma
              informação de cliente é exibida.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
