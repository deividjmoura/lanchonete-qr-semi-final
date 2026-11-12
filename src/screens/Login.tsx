import { motion, useReducedMotion } from "framer-motion";
import { EnvelopeSimple, WhatsappLogo } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { FormularioAcesso, destinoDoPapel, useFluxoAcesso } from "../components/AuthFlow";
import { EMAIL_URL, WHATSAPP_URL } from "./landing/contato";
import { ThemeToggle } from "../components/ui";
import { ir } from "../router";
import { temIndicioDeSessao, usePub } from "../store/usePub";
import "./login-fields.css";

export default function Login() {
  const auth = usePub((s) => s.auth);
  const hydrateMe = usePub((s) => s.hydrateMe);
  const [verificado, setVerificado] = useState(false);

  // #300: ao abrir uma nova aba em #/login (ou receber login em outra aba),
  // consulta /api/me quando há indício de sessão ativa neste navegador — sem
  // disparar 401 desnecessário em visitas anônimas nem quando ?trocar=1 / ?google_error.
  useEffect(() => {
    const query = window.location.hash.split("?")[1] || "";
    const params = new URLSearchParams(query);
    if (params.get("google_error") || params.get("trocar") === "1") {
      return;
    }
    if (!temIndicioDeSessao()) {
      setVerificado(true);
      return;
    }
    let ativo = true;
    void hydrateMe().then((resultado) => {
      if (!ativo) return;
      setVerificado(true);
      if (resultado === "autenticada") {
        const atual = usePub.getState().auth;
        if (atual?.role) ir(destinoDoPapel(atual.role));
      }
    });
    return () => {
      ativo = false;
    };
  }, [hydrateMe]);

  useEffect(() => {
    if (!verificado || !auth?.role) return;
    const query = window.location.hash.split("?")[1] || "";
    const params = new URLSearchParams(query);
    if (params.get("google_error") || params.get("trocar") === "1") return;
    ir(destinoDoPapel(auth.role));
  }, [verificado, auth]);

  const paginaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pagina = paginaRef.current;
    if (!pagina) return;
    const viewport = window.visualViewport;
    const atualizar = () => {
      const altura = viewport?.height ?? window.innerHeight;
      pagina.style.setProperty("--login-height", `${altura}px`);
      pagina.style.setProperty("--login-top", `${viewport?.offsetTop ?? 0}px`);
      pagina.dataset.compact = altura < 600 ? "true" : "false";
    };
    const overflowBody = document.body.style.overflow;
    const overflowHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    atualizar();
    viewport?.addEventListener("resize", atualizar);
    viewport?.addEventListener("scroll", atualizar);
    window.addEventListener("resize", atualizar);
    return () => {
      viewport?.removeEventListener("resize", atualizar);
      viewport?.removeEventListener("scroll", atualizar);
      window.removeEventListener("resize", atualizar);
      document.body.style.overflow = overflowBody;
      document.documentElement.style.overflow = overflowHtml;
    };
  }, []);

  const fluxo = useFluxoAcesso();
  const reduceMotion = useReducedMotion();

  return (
    <div
      ref={paginaRef}
      className="login-page login-viewport flex h-[100dvh] min-h-0 flex-col overflow-hidden p-3 sm:p-5 bg-surface text-text"
    >
      <main className="login-main my-auto flex min-h-0 flex-1 items-center justify-center py-2 sm:py-3">
        <motion.section
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
          aria-labelledby="login-titulo"
          className="login-card login-panel w-full max-w-lg overflow-hidden"
        >
          {/* Cabeçalho do passe de acesso: o logo oficial mora numa placa de papel. */}
          <div className="login-brand">
            <span className="logo-placa login-brand-plate">
              <img
                src="/logo/qradmin-mark.png"
                alt="QR Admin"
                width="72"
                height="72"
                className="login-brand-mark object-contain"
                draggable={false}
              />
            </span>
            <div className="login-brand-copy">
              <p className="rotulo text-brand-ink">QR Admin</p>
              <h1 id="login-titulo" className="font-display text-text">
                Acesso à equipe
              </h1>
              <p className="text-text-muted">Selecione seu setor para continuar.</p>
            </div>
          </div>

          <div className="login-card-content login-content mx-auto w-full max-w-md">
            <FormularioAcesso fluxo={fluxo} idPrefixo="login" />
          </div>
        </motion.section>
      </main>

      <footer className="login-footer mx-auto w-full max-w-6xl">
        <div className="login-footer-inner flex flex-col items-center justify-between gap-2 sm:flex-row">
          <div className="login-footer-legal flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="/termos-de-uso.html" className="login-footer-text-link">
              Termos de uso
            </a>
            <a href="/politica-de-privacidade.html" className="login-footer-text-link">
              Política de privacidade
            </a>
            <a href="/novidades.html" className="login-footer-text-link">
              Novidades e versões
            </a>
            <span className="text-xs text-text-muted">© {new Date().getFullYear()} QR Admin. Todos os direitos reservados.</span>
          </div>
          <nav aria-label="Contato e aparência" className="flex items-center gap-1">
            <a
              className="login-footer-link"
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contato pelo WhatsApp"
              title="WhatsApp"
            >
              <WhatsappLogo size={20} weight="regular" />
            </a>
            <a
              className="login-footer-link"
              href={EMAIL_URL}
              aria-label="Contato por e-mail"
              title="E-mail"
            >
              <EnvelopeSimple size={20} weight="regular" />
            </a>
            <ThemeToggle className="login-icon-action" />
          </nav>
        </div>
      </footer>
    </div>
  );
}
