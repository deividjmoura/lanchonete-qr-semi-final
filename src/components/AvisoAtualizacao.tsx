import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, X } from "@phosphor-icons/react";

const INTERVALO_VERIFICACAO_MS = 60_000;

type RespostaVersao = { version?: string };

async function consultarVersao(): Promise<string | null> {
  try {
    const resposta = await fetch("/api/version", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as RespostaVersao;
    return typeof dados.version === "string" && dados.version ? dados.version : null;
  } catch {
    // Falha temporária de rede não deve interromper o trabalho nem gerar alertas.
    return null;
  }
}

export function AvisoAtualizacao() {
  const versaoConhecida = useRef<string | null>(null);
  const versaoNotificada = useRef<string | null>(null);
  const [atualizacaoDisponivel, setAtualizacaoDisponivel] = useState(false);
  const [dispensado, setDispensado] = useState(false);
  const [verificando, setVerificando] = useState(false);

  const verificar = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const versao = await consultarVersao();
    if (!versao) return;
    if (versaoConhecida.current === null) {
      versaoConhecida.current = versao;
      return;
    }
    if (versao !== versaoConhecida.current && versaoNotificada.current !== versao) {
      versaoNotificada.current = versao;
      setAtualizacaoDisponivel(true);
      setDispensado(false);
      try {
        const canal = new BroadcastChannel("qr-admin-update");
        canal.postMessage({ type: "update-available", version: versao });
        canal.close();
      } catch { /* BroadcastChannel indisponível: cada aba continua verificando */ }
    }
  }, []);

  useEffect(() => {
    void verificar();
    const intervalo = window.setInterval(() => void verificar(), INTERVALO_VERIFICACAO_MS);
    let canal: BroadcastChannel | null = null;
    try {
      canal = new BroadcastChannel("qr-admin-update");
      canal.onmessage = (evento: MessageEvent<{ type?: string; version?: string }>) => {
        if (evento.data?.type === "update-available" && evento.data.version) {
          versaoNotificada.current = evento.data.version;
          setAtualizacaoDisponivel(true);
          setDispensado(false);
        }
      };
    } catch { /* Navegadores sem BroadcastChannel usam a consulta periódica */ }
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void verificar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      window.clearInterval(intervalo);
      canal?.close();
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [verificar]);

  const atualizar = () => {
    if (verificando) return;
    const confirmou = window.confirm(
      "Uma nova versão do QR Admin está disponível. Salve ou conclua qualquer operação em andamento antes de atualizar a página. Deseja atualizar agora?"
    );
    if (!confirmou) return;
    setVerificando(true);
    window.location.reload();
  };

  if (!atualizacaoDisponivel || dispensado) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-3 z-[100] mx-auto flex max-w-2xl items-center gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3 shadow-modal"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-hover text-brand-ink">
        <ArrowClockwise size={19} weight="bold" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">Nova atualização disponível</p>
        <p className="text-xs leading-relaxed text-text-muted">
          Uma nova versão do QR Admin foi publicada. Atualize quando terminar suas operações.
        </p>
      </div>
      <button
        type="button"
        onClick={atualizar}
        disabled={verificando}
        className="shrink-0 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-brand-contrast hover:bg-brand-hover disabled:opacity-60"
      >
        Atualizar
      </button>
      <button
        type="button"
        aria-label="Continuar trabalhando e dispensar aviso"
        title="Continuar trabalhando"
        onClick={() => setDispensado(true)}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
      >
        <X size={17} />
      </button>
    </aside>
  );
}
