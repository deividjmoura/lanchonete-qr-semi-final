import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useFluxoAcesso, FormularioAcesso } from "./AuthFlow";
import { ir } from "../router";
import "../screens/login-fields.css";
import "./AuthModal.css";

/* Modal de acesso da landing.
 *
 * Reaproveita o MESMO fluxo de autenticação da página /#/login
 * (`FormularioAcesso` + `useFluxoAcesso`, que chamam lib/api com CSRF, cookie
 * de sessão, segundo fator e Google). Nenhum login paralelo é criado.
 *
 * Acessibilidade: role=dialog + aria-modal, foco inicial no primeiro controle,
 * Tab/Shift+Tab presos no modal, ESC e clique no fundo fecham, e o foco volta
 * para o elemento que abriu. */

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function PainelAcesso({ aoFechar }: { aoFechar: () => void }) {
  const reduceMotion = useReducedMotion();
  const painelRef = useRef<HTMLDivElement | null>(null);
  const tituloId = useId();

  const aoEntrar = useCallback(() => {
    aoFechar();
    ir("/admin");
  }, [aoFechar]);

  const fluxo = useFluxoAcesso(aoEntrar);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focar = () => {
      const painel = painelRef.current;
      if (!painel) return;
      const alvo = painel.querySelector<HTMLElement>(FOCAVEIS);
      (alvo ?? painel).focus({ preventScroll: true });
    };
    const t = window.setTimeout(focar, 40);

    const aoTeclar = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        aoFechar();
        return;
      }
      if (event.key !== "Tab") return;
      const painel = painelRef.current;
      if (!painel) return;
      const focaveis = [...painel.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (event.shiftKey && document.activeElement === primeiro) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", aoTeclar, true);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus?.({ preventScroll: true });
    };
  }, [aoFechar]);

  return (
    <motion.div
      ref={painelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      className="acesso-modal__panel"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
      tabIndex={-1}
    >
      <div className="acesso-modal__top">
        <p className="acesso-modal__eyebrow rotulo">
          <span className="acesso-modal__rule" aria-hidden="true" />
          QR Admin · acesso da equipe
        </p>
        <button type="button" className="acesso-modal__close" onClick={aoFechar} aria-label="Fechar acesso">
          <X size={18} weight="bold" />
        </button>
      </div>

      <div className="acesso-modal__body">
        <div className="acesso-modal__brand">
          <span className="logo-placa acesso-modal__plate">
            <img src="/logo/qradmin-mark.png" alt="" width="52" height="52" aria-hidden="true" draggable={false} />
          </span>
          <div>
            <h2 id={tituloId} className="acesso-modal__title font-display">
              Acesso à equipe
            </h2>
            <p className="acesso-modal__lead">Selecione seu setor para continuar.</p>
          </div>
        </div>

        <FormularioAcesso fluxo={fluxo} idPrefixo="acesso-modal" />
      </div>

      <div className="acesso-modal__foot">
        <span>Acesso restrito a funcionários cadastrados.</span>
        <a href="/guia-sistema.html">Guia do sistema</a>
      </div>
    </motion.div>
  );
}

export function AuthModal({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const reduceMotion = useReducedMotion();

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {aberto && (
        <motion.div
          className="acesso-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.14 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) aoFechar();
          }}
        >
          <PainelAcesso aoFechar={aoFechar} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
