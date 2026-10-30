import { Key, ShieldWarning, X } from "@phosphor-icons/react";
import { useState } from "react";
import { usePub } from "../store/usePub";

const MIN = 12;

function dica(nova: string, confirmar: string): string | null {
  if (nova.length > 0 && nova.length < MIN) return `Use pelo menos ${MIN} caracteres.`;
  if (confirmar.length > 0 && nova !== confirmar) return "A confirmação não confere com a nova senha.";
  return null;
}

export function TrocarSenha({ obrigatorio, onClose }: { obrigatorio: boolean; onClose: () => void }) {
  const trocarSenhaApi = usePub((s) => s.trocarSenhaApi);
  const login = usePub((s) => s.auth?.login || s.auth?.role || "");
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const aviso = dica(nova, confirmar);
  const podeEnviar = !busy && atual.length > 0 && nova.length >= MIN && nova === confirmar;

  const enviar = async () => {
    if (!podeEnviar) return;
    setBusy(true);
    setErro(null);
    const msg = await trocarSenhaApi(atual, nova);
    setBusy(false);
    if (msg) {
      setAtual("");
      setNova("");
      setConfirmar("");
      setErro(msg);
      return;
    }
    setOk(true);
    setTimeout(() => (obrigatorio ? window.location.reload() : onClose()), 1200);
  };

  const campo =
    "mt-1 w-full rounded-sm border border-line-strong bg-surface-sunken px-3.5 h-12 text-sm text-text outline-none focus:border-brand";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trocar-senha-titulo"
      className="fixed inset-0 z-50 grid place-items-center bg-surface-overlay p-4"
    >
      <div className="w-full max-w-md rounded-md border border-line-strong bg-surface-raised p-6">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-line">
          <div className="flex items-center gap-2.5">
            {obrigatorio ? (
              <ShieldWarning size={22} weight="fill" className="text-status-warning-ink shrink-0" />
            ) : (
              <Key size={22} weight="regular" className="text-brand-ink shrink-0" />
            )}
            <h2
              id="trocar-senha-titulo"
              className="font-display text-2xl font-extrabold uppercase tracking-tight text-text"
            >
              {obrigatorio ? "Defina uma nova senha" : "Alterar senha"}
            </h2>
          </div>
          {!obrigatorio && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-line text-text-muted hover:text-text hover:bg-surface-hover"
            >
              <X size={18} weight="bold" />
            </button>
          )}
        </div>

        {obrigatorio && (
          <p className="mt-3 text-xs text-text-muted leading-relaxed">
            Esta conta usa uma senha inicial ou compartilhada. Por segurança, escolha uma senha exclusiva para continuar.
          </p>
        )}

        {ok ? (
          <p
            role="status"
            className="mt-5 rounded-sm border border-status-success-border bg-status-success-surface p-3.5 text-xs font-semibold text-status-success-ink"
          >
            Senha alterada. Os outros dispositivos foram desconectados.
          </p>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            <input
              type="text"
              name="username"
              id="trocar-senha-usuario"
              autoComplete="username"
              value={login}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
            />
            <label className="block font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted">
              Senha atual
              <input
                type="password"
                name="current-password"
                autoComplete="current-password"
                autoFocus
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
                className={campo}
              />
            </label>
            <label className="block font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted">
              Nova senha (mín. {MIN} caracteres)
              <input
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                className={campo}
              />
            </label>
            <label className="block font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted">
              Confirmar nova senha
              <input
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className={campo}
              />
            </label>

            {(erro || aviso) && (
              <p
                role="alert"
                className="rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs font-semibold text-status-danger-ink"
              >
                {erro || aviso}
              </p>
            )}

            <button
              type="submit"
              disabled={!podeEnviar}
              className="mt-2 min-h-12 w-full rounded-sm bg-brand border border-brand text-sm font-bold text-brand-contrast hover:bg-brand-hover disabled:opacity-45"
            >
              {busy ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
