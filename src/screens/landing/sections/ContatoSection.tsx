import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";
import { EMAIL_URL, whatsappLink } from "../contato";
import { useRolagemInterna } from "../useRolagemInterna";

/* Formatos de adesão.
 *
 * Os três formatos já existiam na tabela comercial do produto. Os valores
 * ficam "sob consulta" aqui de propósito: preço no site oficial vira promessa
 * pública, e a faixa depende do tamanho da casa e do escopo acordado. Quem
 * quiser o número fala direto com o responsável pela conversa. */
const formatos = [
  {
    number: "01",
    icon: "clock",
    titulo: "Assinatura mensal",
    texto:
      "Para quem quer começar sem investimento de implantação: mensalidade, acesso completo ao sistema e suporte no mesmo canal desta página.",
  },
  {
    number: "02",
    icon: "layers",
    titulo: "Aquisição do sistema",
    texto:
      "Para operações que preferem licença própria: o QRAdmin é entregue e configurado para a casa, com acompanhamento na entrada em produção.",
  },
  {
    number: "03",
    icon: "card",
    titulo: "Venda exclusiva",
    texto:
      "Para grupos e redes que querem o sistema sob exclusividade em uma região. Escopo, prazo e condições são definidos na conversa.",
  },
];

export function ContatoSection() {
  const rolar = useRolagemInterna();
  const mensagemFormato = (titulo: string) =>
    whatsappLink(
      `Olá! Vi o site do QR Admin e tenho interesse no formato "${titulo}". Podemos conversar?`,
    );

  return (
    <section className="contato-section" id="contato" aria-labelledby="contato-title">
      <div className="page-shell">
        <div className="contato-section__heading">
          <SectionIntro
            eyebrow="CONTATE-NOS"
            title="Como a sua casa passa a usar o QRAdmin."
            id="contato-title"
          >
            <p>
              A adesão começa em uma conversa direta com quem responde pelo QRAdmin. Escolha o
              formato que faz sentido para a sua operação e fale com a gente pelo WhatsApp ou por
              e-mail — sem formulário, sem cadastro intermediário.
            </p>
          </SectionIntro>
          <div className="contato-canais">
            <a
              className="contato-canal contato-canal--whatsapp"
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="contato-canal__icon">
                <Icon name="whatsapp" size={20} />
              </span>
              <span className="contato-canal__text">
                <span className="contato-canal__label">WHATSAPP</span>
                <span className="contato-canal__value">Mensagem direta</span>
              </span>
              <Icon name="arrow-up-right" size={16} />
            </a>
            <a className="contato-canal" href={EMAIL_URL}>
              <span className="contato-canal__icon">
                <Icon name="mail" size={20} />
              </span>
              <span className="contato-canal__text">
                <span className="contato-canal__label">E-MAIL</span>
                <span className="contato-canal__value">Enviar mensagem</span>
              </span>
              <Icon name="arrow-up-right" size={16} />
            </a>
          </div>
        </div>

        <ul className="contato-formatos">
          {formatos.map((formato) => (
            <li className="contato-formato" key={formato.number}>
              <div className="contato-formato__top">
                <span className="contato-formato__number">{formato.number}</span>
                <span className="contato-formato__icon">
                  <Icon name={formato.icon} size={20} />
                </span>
              </div>
              <h3>{formato.titulo}</h3>
              <p>{formato.texto}</p>
              <p className="contato-formato__preco">
                <span>PREÇO</span> Sob consulta
              </p>
              <a
                className="contato-formato__link"
                href={mensagemFormato(formato.titulo)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Falar sobre ${formato.titulo} pelo WhatsApp`}
              >
                Falar sobre este formato
                <Icon name="arrow-up-right" size={15} />
              </a>
            </li>
          ))}
        </ul>

        <p className="contato-section__note">
          <Icon name="info" size={14} />
          {/* O texto vai em um span: com display:flex no parágrafo, texto solto
              vira item flex anônimo e o link quebrava em coluna estreita. */}
          <span>
            Acesso ao sistema pela equipe continua na mesma autenticação em{" "}
            <a
              href="#acesso"
              className="contato-section__note-link"
              onClick={(event) => rolar(event, "#acesso")}
            >
              Acesso ao sistema
            </a>
            . Valores, prazos e disponibilidade são confirmados na conversa.
          </span>
        </p>
      </div>
    </section>
  );
}
