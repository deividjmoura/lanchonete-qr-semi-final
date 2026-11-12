import { Icon } from "../components/Icon";
import { SectionIntro } from "../components/SectionIntro";
import { EMAIL_DOMINIO, EMAIL_URL, EMAIL_USUARIO, whatsappLink } from "../contato";

export function ContatoSection() {
  return (
    <section className="contato" id="contato" aria-labelledby="contato-title">
      <div className="page-shell">
        <div className="contato__cabecalho">
          <SectionIntro eyebrow="Contato direto" title="Converse sobre a rotina da sua casa." id="contato-title">
            <p>
              Quer conhecer o QR Admin ou tirar uma dúvida sobre a operação? Fale com a equipe pelo
              WhatsApp ou por e-mail — sem formulário nem cadastro intermediário.
            </p>
          </SectionIntro>

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

        <p className="contato__nota">
          <Icon name="info" size={16} />
          <span>
            Precisa de orientação? Consulte o guia de <a href="/guia-sistema.html#acesso">acesso</a> ou as
            instruções de <a href="/guia-sistema.html#uso">uso do sistema</a>.
          </span>
        </p>
      </div>
    </section>
  );
}
