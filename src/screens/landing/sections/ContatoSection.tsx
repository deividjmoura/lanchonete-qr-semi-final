import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";
import { EMAIL_DOMINIO, EMAIL_URL, EMAIL_USUARIO, whatsappLink } from "../contato";
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
      "Para operações que preferem licença própria: o QR Admin é entregue e configurado para a casa, com acompanhamento na entrada em produção.",
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
    whatsappLink(`Olá! Vi o site do QR Admin e tenho interesse no formato "${titulo}". Podemos conversar?`);

  return (
    <section className="contato" id="contato" aria-labelledby="contato-title">
      <div className="page-shell">
        <div className="contato__cabecalho">
          <SectionIntro eyebrow="Contate-nos" title="Como a sua casa passa a usar o QR Admin." id="contato-title">
            <p>
              A adesão começa em uma conversa direta com quem responde pelo QR Admin. Escolha o
              formato que faz sentido para a sua operação e fale com a gente pelo WhatsApp ou por
              e-mail — sem formulário, sem cadastro intermediário.
            </p>
          </SectionIntro>

          {/* Os dois canais ficam lado a lado, cada um com o próprio ícone. */}
          <div className="contato__canais">
            <a
              className="contato-canal contato-canal--whatsapp"
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="contato-canal__icone">
                <Icon name="whatsapp" size={26} />
              </span>
              <span className="contato-canal__texto">
                <span className="contato-canal__rotulo">WhatsApp</span>
                <span className="contato-canal__valor">Mensagem direta</span>
              </span>
            </a>
            <a className="contato-canal contato-canal--email" href={EMAIL_URL}>
              <span className="contato-canal__icone">
                <Icon name="mail" size={26} />
              </span>
              <span className="contato-canal__texto">
                <span className="contato-canal__rotulo">E-mail</span>
                <span className="contato-canal__valor">
                  {EMAIL_USUARIO}@<wbr />
                  {EMAIL_DOMINIO}
                </span>
              </span>
            </a>
          </div>
        </div>

        <ul className="contato__formatos">
          {formatos.map((formato) => (
            <li className="contato-formato" key={formato.number}>
              <div className="contato-formato__topo">
                <span className="dado">{formato.number}</span>
                <Icon name={formato.icon} size={20} />
              </div>
              <h3>{formato.titulo}</h3>
              <p>{formato.texto}</p>
              <p className="contato-formato__preco">
                <span>Preço</span> Sob consulta
              </p>
              <a
                className="contato-formato__link"
                href={mensagemFormato(formato.titulo)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Falar sobre ${formato.titulo} pelo WhatsApp`}
              >
                <Icon name="whatsapp" size={18} />
                Falar sobre este formato
              </a>
            </li>
          ))}
        </ul>

        <p className="contato__nota">
          <Icon name="info" size={16} />
          <span>
            O acesso da equipe continua na mesma autenticação, em{" "}
            <a href="#acesso" onClick={(event) => rolar(event, "#acesso")}>
              Acesso ao sistema
            </a>
            . Valores, prazos e disponibilidade são confirmados na conversa.
          </span>
        </p>
      </div>
    </section>
  );
}
