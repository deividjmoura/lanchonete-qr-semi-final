import { useRef, useState, type KeyboardEvent } from "react";
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
      { icon: "card", title: "PIX com valor exato", detail: "Aviso do cliente e confirmação no caixa" },
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
      { icon: "users", title: "Equipe", detail: "Contas por setor e segundo fator" },
      { icon: "chart", title: "Indicadores", detail: "Painel gerencial do período" },
    ],
    captura: "gestao-cardapio",
    tela: "Cardápio e estoque",
  },
];

export function FeaturesSection() {
  const [ativoId, setAtivoId] = useState(modulos[0].id);
  const abas = useRef<(HTMLButtonElement | null)[]>([]);
  const ativo = modulos.find((item) => item.id === ativoId) ?? modulos[0];

  /* Padrão de abas do WAI-ARIA: setas trocam a aba e levam o foco junto. */
  const aoTeclar = (event: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const ultimo = modulos.length - 1;
    let proximo = indice;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") proximo = indice === ultimo ? 0 : indice + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") proximo = indice === 0 ? ultimo : indice - 1;
    if (event.key === "Home") proximo = 0;
    if (event.key === "End") proximo = ultimo;
    if (proximo !== indice) {
      event.preventDefault();
      setAtivoId(modulos[proximo].id);
      abas.current[proximo]?.focus();
    }
  };

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

        <div className="modulos__abas" role="tablist" aria-label="Módulos do QR Admin">
          {modulos.map((modulo, indice) => (
            <button
              className="modulos__aba"
              type="button"
              role="tab"
              key={modulo.id}
              id={`modulo-aba-${modulo.id}`}
              aria-selected={ativoId === modulo.id}
              aria-controls="modulo-painel"
              tabIndex={ativoId === modulo.id ? 0 : -1}
              ref={(elemento) => {
                abas.current[indice] = elemento;
              }}
              onClick={() => setAtivoId(modulo.id)}
              onKeyDown={(event) => aoTeclar(event, indice)}
            >
              <span className="modulos__aba-no" aria-hidden="true" />
              <span className="modulos__aba-rotulo">
                <span className="dado">0{indice + 1}</span> {modulo.kicker}
              </span>
              <strong>{modulo.label}</strong>
            </button>
          ))}
        </div>

        <div
          className="modulos__painel"
          role="tabpanel"
          id="modulo-painel"
          aria-labelledby={`modulo-aba-${ativo.id}`}
          tabIndex={0}
        >
          <div className="modulos__texto">
            <h3>{ativo.title}</h3>
            <p>{ativo.description}</p>
            <ul className="modulos__lista">
              {ativo.rows.map((row) => (
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
          </div>
          <figure className="moldura modulos__tela">
            <div className="moldura__topo">
              <span className="moldura__no" aria-hidden="true" />
              <span className="moldura__nome">{ativo.tela}</span>
            </div>
            <Captura key={ativo.captura} chave={ativo.captura} className="moldura__imagem" />
          </figure>
        </div>

        <p className="modulos__nota">
          Os nomes acima seguem as telas do sistema. Para o detalhamento de cada área, consulte o{" "}
          <a href="/guia-sistema.html">guia do sistema</a>.
        </p>
      </div>
    </section>
  );
}
