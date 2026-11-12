import { Captura, type CapturaChave } from "../components/Capturas";
import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";

type Modulo = {
  id: string;
  label: string;
  kicker: string;
  title: string;
  description: string;
  rows: { icon: string; title: string; detail: string }[];
  captura: CapturaChave;
  tela: string;
};

const modulos: Modulo[] = [
  {
    id: "atendimento",
    label: "Atendimento",
    kicker: "Salão",
    title: "Do QR à mesa.",
    description:
      "Cardápio digital por QR Code, mesas com sessão própria, personalização de itens e acompanhamento da comanda pelo cliente.",
    rows: [
      { icon: "qr", title: "Cardápio do cliente", detail: "Acesso pelo QR fixo da mesa" },
      { icon: "table", title: "Mesa e sessão", detail: "Mapa do salão e check-in" },
      { icon: "receipt", title: "Pedido", detail: "Itens, adicionais e observações" },
    ],
    captura: "mapa-mesas",
    tela: "Panorama das mesas",
  },
  {
    id: "operacao",
    label: "Operação",
    kicker: "Serviço",
    title: "Do pedido à entrega.",
    description:
      "Fila de produção separada por cozinha e bar, controle item a item, aviso por voz, impressão térmica e entregas do garçom.",
    rows: [
      { icon: "receipt", title: "Fila por setor", detail: "Cozinha e bar em tempo real" },
      { icon: "utensils", title: "Produção por item", detail: "Avanço parcial de cada prato" },
      { icon: "check", title: "Entregas do garçom", detail: "Pronto, retirado e entregue" },
    ],
    captura: "fila-bar",
    tela: "Fila do bar",
  },
  {
    id: "financeiro",
    label: "Financeiro",
    kicker: "Fechamento",
    title: "Uma conta que fecha com contexto.",
    description:
      "Caixa com divisão de conta, pagamentos parciais, dinheiro, cartão e PIX com confirmação, comprovantes e histórico de vendas.",
    rows: [
      { icon: "wallet", title: "Fechamento da conta", detail: "Registro por forma de pagamento" },
      { icon: "card", title: "PIX com valor exato", detail: "Aviso do cliente e conferência no app bancário" },
      { icon: "receipt", title: "Histórico de vendas", detail: "Consulta e reimpressão" },
    ],
    captura: "comanda-cliente",
    tela: "Comanda vista pelo cliente",
  },
  {
    id: "gestao",
    label: "Administração",
    kicker: "Gestão",
    title: "Cadastros para organizar a casa.",
    description:
      "Cardápio com fotos, categorias e adicionais, controle de estoque, praças do salão, contas de funcionários e indicadores gerenciais.",
    rows: [
      { icon: "box", title: "Cardápio e estoque", detail: "Produtos, categorias e adicionais" },
      { icon: "users", title: "Equipe", detail: "Contas por setor e 2FA configurável por conta" },
      { icon: "chart", title: "Indicadores", detail: "Painel gerencial do período" },
    ],
    captura: "gestao-cardapio",
    tela: "Cardápio e estoque",
  },
];

export function FeaturesSection() {
  return (
    <section className="modulos" id="funcionalidades" aria-labelledby="features-title">
      <div className="page-shell">
        <div className="modulos__cabecalho">
          <SectionIntro
            eyebrow="Módulos por contexto de trabalho"
            title="Não são módulos soltos. São momentos da mesma operação."
            id="features-title"
          >
            <p>Os grupos de recursos do QR Admin, da chegada do cliente à visão administrativa.</p>
          </SectionIntro>
          <p className="aviso" role="note">
            <Icon name="info" size={18} />
            <span>
              <strong>Funcionalidades implementadas.</strong> Os recursos abaixo existem no produto e
              estão no ambiente de demonstração; a conta usada nas capturas contém apenas dados
              fictícios.
            </span>
          </p>
        </div>

        <div className="modulos__grade">
          {modulos.map((modulo, indice) => (
            <article
              className={`modulos__cartao modulos__cartao--${modulo.id}`}
              key={modulo.id}
              aria-labelledby={`modulo-titulo-${modulo.id}`}
            >
              <div className="modulos__cartao-cabecalho">
                <p className="modulos__cartao-contexto">
                  <span className="modulos__cartao-no" aria-hidden="true" />
                  <span>{modulo.kicker}</span>
                </p>
                <span className="dado modulos__cartao-numero" aria-hidden="true">
                  0{indice + 1}
                </span>
              </div>

              <h3 id={`modulo-titulo-${modulo.id}`}>{modulo.title}</h3>
              <p className="modulos__cartao-descricao">{modulo.description}</p>

              <figure className="moldura modulos__captura">
                <div className="moldura__topo">
                  <span className="moldura__no" aria-hidden="true" />
                  <span className="moldura__nome">{modulo.tela}</span>
                </div>
                <Captura chave={modulo.captura} className="modulos__captura-imagem" />
                <figcaption>{modulo.label} · captura real com dados fictícios</figcaption>
              </figure>

              <ul className="modulos__lista" aria-label={`Recursos de ${modulo.label}`}>
                {modulo.rows.map((row) => (
                  <li key={row.title}>
                    <span className="modulos__lista-icone">
                      <Icon name={row.icon} size={18} />
                    </span>
                    <span>
                      <strong>{row.title}</strong>
                      <small>{row.detail}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="modulos__nota">
          A confirmação do PIX é manual, no aplicativo bancário; avisos sonoros e por voz dependem do
          navegador e do dispositivo. Para o detalhamento de cada área, consulte o{" "}
          <a href="/guia-sistema.html">guia do sistema</a>.
        </p>
      </div>
    </section>
  );
}
