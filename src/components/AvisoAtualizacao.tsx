import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, X } from "@phosphor-icons/react";
import { confirmarAcao } from "../lib/confirmacao";
import { criarVigiaDeVersao, type EstadoAtualizacao } from "../lib/atualizacao";
import { estadoDoTrabalho } from "../lib/trabalhoPendente";

declare const __BUILD_VERSION__: string;

const CANAL = "qr-admin-atualizacao";

/**
 * Chave do adiamento por versão. Guarda apenas o identificador do build que o
 * operador escolheu adiar — nunca preferência de negócio, fila offline ou
 * credencial. Se o storage estiver bloqueado, o aviso continua funcionando só
 * com o estado em memória.
 */
const CHAVE_ADIAMENTO = "qradmin:atualizacao-adiada";

function lerAdiamento(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_ADIAMENTO);
  } catch {
    return null;
  }
}

function gravarAdiamento(versao: string) {
  try {
    window.localStorage.setItem(CHAVE_ADIAMENTO, versao);
  } catch {
    /* armazenamento bloqueado: adiamento vale só nesta aba */
  }
}

/** Consulta a versão publicada. Qualquer falha resolve `null` (silenciosa). */
async function consultarVersaoPublicada(): Promise<string | null> {
  try {
    const resposta = await fetch("/api/version", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { version?: unknown };
    return typeof dados.version === "string" && dados.version ? dados.version : null;
  } catch {
    // Falha temporária de rede não interrompe o trabalho nem gera alerta.
    return null;
  }
}

function criarCanalDeAbas() {
  if (typeof BroadcastChannel === "undefined") return null;
  const canal = new BroadcastChannel(CANAL);
  return {
    postMessage: (mensagem: unknown) => canal.postMessage(mensagem),
    get onmessage() {
      return canal.onmessage as ((evento: { data?: unknown }) => void) | null;
    },
    set onmessage(fn: ((evento: { data?: unknown }) => void) | null) {
      canal.onmessage = fn as ((evento: MessageEvent) => void) | null;
    },
    close: () => canal.close(),
  };
}

function mensagemDeConfirmacao(): string {
  const trabalho = estadoDoTrabalho();
  const partes: string[] = [];
  if (trabalho.operacoes > 0) {
    partes.push(
      trabalho.operacoes === 1
        ? "há 1 operação sendo enviada ao servidor agora"
        : `há ${trabalho.operacoes} operações sendo enviadas ao servidor agora`
    );
  }
  if (trabalho.formulario) partes.push("há campos de formulário alterados e não salvos");
  if (trabalho.telaOcupada) partes.push("a tela indica uma operação em andamento");

  if (partes.length) {
    return (
      `Antes de atualizar: ${partes.join("; ")}.\n\n` +
      "Recarregar agora pode descartar esse trabalho ou impedir você de ver o resultado de uma operação já enviada. " +
      "Recomendamos concluir e conferir tudo antes de continuar.\n\nAtualizar mesmo assim?"
    );
  }
  return (
    "Uma nova versão do QR Admin está publicada.\n\n" +
    "Confirme que pedidos, pagamentos e fechamentos em andamento já foram concluídos antes de atualizar. " +
    "A página será recarregada e o aviso desaparece.\n\nAtualizar agora?"
  );
}

/**
 * Aviso discreto de nova versão publicada (#301).
 *
 * Não recarrega sozinho: o operador escolhe Atualizar agora ou continuar
 * trabalhando. O adiamento vale para a versão detectada e é compartilhado com
 * as outras abas; a recarga usa `location.reload()` e, quando o navegador
 * permite, `history.replaceState` antes, para garantir que o documento novo
 * venha da rede (o shell do SPA é servido com `Cache-Control: no-store`).
 */
export function AvisoAtualizacao() {
  const [estado, setEstado] = useState<EstadoAtualizacao>("ocioso");
  const [atualizando, setAtualizando] = useState(false);
  const vigia = useRef<ReturnType<typeof criarVigiaDeVersao> | null>(null);

  useEffect(() => {
    const instancia = criarVigiaDeVersao({
      versaoEmExecucao: __BUILD_VERSION__,
      consultarVersao: consultarVersaoPublicada,
      aoMudar: (novo) => setEstado(novo),
      criarCanal: criarCanalDeAbas,
      lerAdiamento,
      gravarAdiamento,
      visivel: () => document.visibilityState !== "hidden",
      registrarGatilhos: (verificar) => {
        const aoVoltar = () => {
          if (document.visibilityState === "visible") verificar();
        };
        document.addEventListener("visibilitychange", aoVoltar);
        window.addEventListener("focus", aoVoltar);
        return () => {
          document.removeEventListener("visibilitychange", aoVoltar);
          window.removeEventListener("focus", aoVoltar);
        };
      },
    });
    vigia.current = instancia;
    return instancia.iniciar();
  }, []);

  /* Proteção do navegador só enquanto existe aviso pendente: fechar/recarregar
     a aba por fora (F5, atalho) com trabalho não salvo pede confirmação. */
  useEffect(() => {
    if (estado === "ocioso") return;
    const protegerSaida = (evento: BeforeUnloadEvent) => {
      if (!estadoDoTrabalho().pendente) return;
      evento.preventDefault();
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", protegerSaida);
    return () => window.removeEventListener("beforeunload", protegerSaida);
  }, [estado]);

  const adiar = useCallback(() => {
    vigia.current?.adiar();
    setEstado("dispensado");
  }, []);

  const atualizar = useCallback(async () => {
    if (atualizando) return;
    const confirmou = await confirmarAcao({
      titulo: "Atualizar para a nova versão?",
      mensagem: mensagemDeConfirmacao(),
      confirmar: "Atualizar agora",
      cancelar: "Continuar por enquanto",
      perigo: estadoDoTrabalho().pendente,
    });
    if (!confirmou) {
      // Cancelar no modal equivale a adiar: não reabre o aviso sozinho.
      adiar();
      return;
    }
    setAtualizando(true);
    window.location.reload();
  }, [adiar, atualizando]);

  if (estado !== "disponivel") return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Nova versão disponível"
      className="fixed inset-x-3 top-3 z-[100] mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3 shadow-modal"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-hover text-brand-ink">
        <ArrowClockwise size={19} weight="bold" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">Nova versão disponível</p>
        <p className="text-xs leading-relaxed text-text-muted">
          Atualize quando terminar suas operações. Você continua trabalhando na versão atual até decidir.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void atualizar()}
          disabled={atualizando}
          className="min-h-9 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60"
        >
          {atualizando ? "Atualizando…" : "Atualizar agora"}
        </button>
        <button
          type="button"
          onClick={adiar}
          className="min-h-9 rounded-md border border-line px-3 py-2 text-xs font-semibold text-text-muted hover:bg-surface-hover"
        >
          Continuar por enquanto
        </button>
        <button
          type="button"
          aria-label="Dispensar aviso de atualização"
          title="Dispensar aviso"
          onClick={adiar}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
        >
          <X size={17} />
        </button>
      </div>
    </aside>
  );
}
