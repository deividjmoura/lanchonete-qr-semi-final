import { KeyRound, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { usePub } from "../store/usePub";

const MIN = 12;

/** Validação local só para feedback imediato; a regra oficial é a do servidor (db/auth.js). */
function dica(nova: string, confirmar: string): string | null {
  if (nova.length > 0 && nova.length < MIN) return `Use pelo menos ${MIN} caracteres.`;
  if (confirmar.length > 0 && nova !== confirmar) return "A confirmação não confere com a nova senha.";
  return null;
}

export function TrocarSenha({ obrigatorio, onClose }: { obrigatorio: boolean; onClose: () => void }) {
  const trocarSenhaApi = usePub((s) => s.trocarSenhaApi);
  // Usuário da sessão: o gerenciador de senhas do navegador salva a nova senha vinculada a ele.
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
    // Recarrega para que a tela busque os dados que foram bloqueados enquanto a troca estava pendente.
    setTimeout(() => (obrigatorio ? window.location.reload() : onClose()), 1200);
  };

  const campo = "w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 h-12 text-sm outline-none focus:border-brand-500/60";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trocar-senha-titulo"
      className="fixed inset-0 z-[100] grid place-items-center bg-navy-900/60 p-4 backdrop-blur-sm"
    >
      <div className="glass-deep w-full max-w-md rounded-4xl border border-brand-500/15 p-6 shadow-xl sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {obrigatorio ? <ShieldAlert className="size-6 text-amber-600" /> : <KeyRound className="size-6 text-brand-600" />}
            <h2 id="trocar-senha-titulo" className="font-display text-2xl text-navy-900">
              {obrigatorio ? "Defina uma nova senha" : "Alterar senha"}
            </h2>
          </div>
          {!obrigatorio && (
            <button onClick={onClose} aria-label="Fechar" className="btn-press grid size-9 place-items-center rounded-full text-slate-500 hover:text-navy-800 cursor-pointer">
              <X className="size-4" />
            </button>
          )}
        </div>

        {obrigatorio && (
          <p className="mt-3 text-sm text-slate-600">
            Esta conta usa uma senha inicial ou compartilhada. Por segurança, escolha uma senha exclusiva para continuar.
          </p>
        )}

        {ok ? (
          <p role="status" className="mt-6 rounded-2xl bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-700">
            Senha alterada. Os outros dispositivos foram desconectados.
          </p>
        ) : (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            {/* Campo de usuário invisível: sem ele o navegador oferece salvar a senha sem nome de usuário. */}
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
            <label className="block text-xs font-semibold text-slate-600">
              Senha atual
              <input type="password" name="current-password" autoComplete="current-password" autoFocus value={atual} onChange={(e) => setAtual(e.target.value)} className={campo} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Nova senha (mín. {MIN} caracteres)
              <input type="password" name="new-password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} className={campo} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Confirmar nova senha
              <input type="password" name="confirm-password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={campo} />
            </label>

            {(erro || aviso) && (
              <p role="alert" className="text-xs font-semibold text-rose-600">
                {erro || aviso}
              </p>
            )}

            <button
              type="submit"
              disabled={!podeEnviar}
              className="btn-press mt-2 h-12 w-full rounded-2xl fill-brand text-sm font-bold text-white disabled:opacity-40 cursor-pointer"
            >
              {busy ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
