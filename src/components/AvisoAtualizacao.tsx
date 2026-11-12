import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, X } from "@phosphor-icons/react";
import { confirmarAcao } from "../lib/confirmacao";
import { criarVigiaDeVersao, type EstadoAtualizacao } from "../lib/atualizacao";
import { estadoDoTrabalho } from "../lib/trabalhoPendente";
import {
  notasDepoisDe,
  resumoDeNovidades,
  VERSAO_DO_APP,
  type NotaDeVersao,
} from "../lib/notasVersao";

declare const __BUILD_VERSION__: string;

const CANAL = "qr-admin-atualizacao";

/**
 * Chave do adiamento por versão. Guarda apenas o identificador do build que o
 * operador escolheu adiar — nunca preferência de negócio, fila offline ou
 * credencial. Se o storage estiver bloqueado, o aviso continua funcionando só
 * com o estado em memória.
 */
const CHAVE_ADIAMENTO = "qradmin:atualizacao-adiada";

/** Evento interno: qualquer ponto do painel pode abrir "O que mudou". */
export const EVENTO_NOVIDADES = "qradmin:abrir-novidades";

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

function mensagemDeConfirmacao(novidades: NotaDeVersao[]): string {
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

  const oQueMuda = novidades.length
    ? `\n\nO que muda: ${novidades.map((nota) => nota.titulo).join("; ")}.`
    : "";

  if (partes.length) {
    return (
      `Antes de atualizar: ${partes.join("; ")}.` +
      oQueMuda +
      "\n\nRecarregar agora pode descartar esse trabalho ou impedir você de ver o resultado de uma operação já enviada. " +
      "Recomendamos concluir e conferir tudo antes de continuar.\n\nAtualizar mesmo assim?"
    );
  }
  return (
    "Uma nova versão do QR Admin está publicada." +
    oQueMuda +
    "\n\nConfirme que pedidos, pagamentos e fechamentos em andamento já foram concluídos antes de atualizar. " +
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
 *
 * O aviso também responde "o que mudou": o corpo lista as notas de versão
 * publicadas depois da versão que esta aba está executando, e o rodapé abre a
 * tela completa (`#/novidades`). Sem nota publicada para a versão, o aviso
 * continua aparecendo — atualização é sobre o deploy, não sobre o changelog.
 */
export function AvisoAtualizacao() {
  const [estado, setEstado] = useState<EstadoAtualizacao>("ocioso");
  const [atualizando, setAtualizando] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const vigia = useRef<ReturnType<typeof criarVigiaDeVersao> | null>(null);

  const novidades = notasDepoisDe(VERSAO_DO_APP);

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
      mensagem: mensagemDeConfirmacao(novidades),
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
  }, [adiar, atualizando, novidades]);

  if (estado !== "disponivel") return null;

  const resumo = resumoDeNovidades(novidades);

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Nova versão disponível"
      className="fixed inset-x-3 top-3 z-[100] mx-auto flex max-w-2xl flex-col gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3 shadow-modal"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-hover text-brand-ink">
          <ArrowClockwise size={19} weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">Nova versão disponível</p>
          <p className="text-xs leading-relaxed text-text-muted">
            {resumo
              ? `${resumo}. Atualize quando terminar suas operações — até lá você continua na versão atual.`
              : "Atualize quando terminar suas operações. Você continua trabalhando na versão atual até decidir."}
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
      </div>

      {novidades.length > 0 && (
        <details
          className="rounded-md border border-line bg-surface-sunken px-3 py-2"
          open={expandido}
          onToggle={(evento) => setExpandido((evento.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-xs font-semibold text-text">
            O que mudou desde esta tela
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {novidades.map((nota) => (
              <li key={nota.versao} className="text-xs leading-relaxed text-text-muted">
                <span className="font-semibold text-text">{nota.titulo}</span>
                <span className="text-text-muted"> — {nota.resumo}</span>
                {nota.itens?.length ? (
                  <ul className="mt-1 ml-4 list-disc">
                    {nota.itens.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          <a
            href="#/novidades"
            onClick={adiar}
            className="mt-2 inline-block text-xs font-semibold text-brand-ink underline underline-offset-2"
          >
            Ver todas as novidades
          </a>
        </details>
      )}
    </aside>
  );
}
