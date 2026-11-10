import { Captura, type CapturaChave } from "../components/Capturas";
import { SectionIntro } from "../components/SectionIntro";
import { usePercurso } from "../usePercurso";

/* O percurso de um pedido, estação por estação.
 *
 * É a narrativa de rolagem da página: à esquerda, a linha de passe com as seis
 * estações; o traço aceso cresce com a rolagem (ver usePercurso). À direita,
 * um palco fixo troca de cena conforme a estação que cruza o meio da tela,
 * sempre com a captura real da tela correspondente.
 *
 * Em telas estreitas não há palco: cada estação mostra a própria captura logo
 * abaixo do texto, e a linha continua acompanhando a rolagem. */
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
  const { trilho, ativa } = usePercurso<HTMLOListElement>();
  const atual = etapas[ativa];

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

        <div className="percurso__grade">
          <ol className="percurso__trilho" ref={trilho}>
            {etapas.map((etapa, indice) => (
              <li
                className="percurso__etapa"
                key={etapa.numero}
                data-etapa={etapa.numero}
                data-estado={indice < ativa ? "feita" : indice === ativa ? "ativa" : "adiante"}
              >
                <span className="percurso__no" aria-hidden="true" />
                <p className="percurso__estacao">
                  <span className="dado">{etapa.numero}</span>
                  {etapa.estacao}
                </p>
                <h3>{etapa.titulo}</h3>
                <p className="percurso__texto">{etapa.texto}</p>
                <figure className="percurso__figura" data-formato={etapa.captura === "entregas-garcom" ? "celular" : "tela"}>
                  <Captura chave={etapa.captura} className="percurso__figura-imagem" />
                  <figcaption>{etapa.tela}</figcaption>
                </figure>
              </li>
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
