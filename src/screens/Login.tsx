import { motion, useReducedMotion } from "framer-motion";
import { EnvelopeSimple, WhatsappLogo } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { FormularioAcesso, useFluxoAcesso } from "../components/AuthFlow";
import { ThemeToggle } from "../components/ui";
import "./login-fields.css";

export default function Login() {
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
      data-regime="expressive"
      className="login-page login-viewport flex h-[100dvh] min-h-0 flex-col overflow-hidden p-3 sm:p-5 bg-surface text-text"
    >
      <main className="login-main my-auto flex min-h-0 flex-1 items-center justify-center py-2 sm:py-3">
        <motion.section
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1.18, 0.36, 1] }}
          aria-labelledby="login-titulo"
          className="login-card login-panel w-full max-w-lg overflow-hidden"
        >
          {/* Cabeçalho da comanda de acesso */}
          <div className="login-brand">
            <img
              src="/logo/qradmin-mark.png"
              alt="QR Admin"
              width="104"
              height="104"
              className="login-brand-mark object-contain"
              draggable={false}
            />
            <div className="login-brand-copy">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-ink">QR Admin</p>
              <h1
                id="login-titulo"
                className="font-display text-3xl font-bold tracking-tight text-text leading-tight sm:text-4xl"
              >
                Acesso à equipe
              </h1>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-muted">
                Selecione seu setor para continuar.
              </p>
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
            <span className="text-xs text-text-muted">© {new Date().getFullYear()} QR Admin. Todos os direitos reservados.</span>
          </div>
          <nav aria-label="Contato e aparência" className="flex items-center gap-1">
            <a
              className="login-footer-link"
              href="https://wa.me/5547996162721"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contato pelo WhatsApp"
              title="WhatsApp"
            >
              <WhatsappLogo size={19} weight="regular" />
            </a>
            <a
              className="login-footer-link"
              href="mailto:dejesusdemouradeivid@gmail.com"
              aria-label="Contato por e-mail"
              title="E-mail"
            >
              <EnvelopeSimple size={18} weight="regular" />
            </a>
            <ThemeToggle className="login-icon-action" />
          </nav>
        </div>
      </footer>
    </div>
  );
}
