import { Key, ShieldWarning, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { usePub } from "../store/usePub";

const MIN = 12;

type ContaStaff = { id: number; nome: string; login: string; papel: string; deveTrocarSenha?: boolean };

const ORDEM_PAPEIS = ["admin", "cozinha", "bar", "caixa"];
const NOME_PAPEL: Record<string, string> = {
  admin: "Admin",
  cozinha: "Cozinha",
  bar: "Bar",
  caixa: "Caixa",
};

/** Validação local só para feedback imediato; a regra oficial é a do servidor (db/auth.js). */
function dica(nova: string, confirmar: string): string | null {
  if (nova.length > 0 && nova.length < MIN) return `Use pelo menos ${MIN} caracteres.`;
  if (confirmar.length > 0 && nova !== confirmar) return "A confirmação não confere com a nova senha.";
  return null;
}

export function TrocarSenha({ obrigatorio, onClose }: { obrigatorio: boolean; onClose: () => void }) {
  const trocarSenhaApi = usePub((s) => s.trocarSenhaApi);
  const redefinirSenhaApi = usePub((s) => s.redefinirSenhaApi);
  const role = usePub((s) => s.auth?.role || null);
  // Usuário da sessão: o gerenciador de senhas do navegador salva a nova senha vinculada a ele.
  const loginSessao = usePub((s) => s.auth?.login || s.auth?.role || "");
  const admin = role === "admin";

  const [contas, setContas] = useState<ContaStaff[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(admin);
  const [erroContas, setErroContas] = useState<string | null>(null);
  const [alvo, setAlvo] = useState("");
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!admin) return;
    let ativo = true;
    setCarregandoContas(true);
    setErroContas(null);
    api.contasStaff()
      .then((rows) => {
        if (!ativo) return;
        const ordenadas = [...rows].sort((a, b) => {
          const pa = ORDEM_PAPEIS.indexOf(a.papel);
          const pb = ORDEM_PAPEIS.indexOf(b.papel);
          return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.login.localeCompare(b.login);
        });
        setContas(ordenadas);
      })
      .catch((e: any) => {
        if (ativo) setErroContas(e?.message || "Não foi possível carregar os setores.");
      })
      .finally(() => {
        if (ativo) setCarregandoContas(false);
      });
    return () => {
      ativo = false;
    };
  }, [admin]);

  const recarregarContas = () => {
    setCarregandoContas(true);
    setErroContas(null);
    api.contasStaff()
      .then((rows) => {
        const ordenadas = [...rows].sort((a, b) => {
          const pa = ORDEM_PAPEIS.indexOf(a.papel);
          const pb = ORDEM_PAPEIS.indexOf(b.papel);
          return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.login.localeCompare(b.login);
        });
        setContas(ordenadas);
      })
      .catch((e: any) => setErroContas(e?.message || "Não foi possível carregar os setores."))
      .finally(() => setCarregandoContas(false));
  };

  // Para o admin, o gerenciador de senhas deve associar a nova senha ao setor
  // selecionado; para os demais, à própria sessão.
  const login = admin ? alvo : loginSessao;
  const aviso = dica(nova, confirmar);
  const podeEnviar =
    !busy &&
    !carregandoContas &&
    (admin ? Boolean(alvo) : atual.length > 0) &&
    nova.length >= MIN &&
    nova === confirmar;

  const enviar = async () => {
    if (!podeEnviar) return;
    setBusy(true);
    setErro(null);
    const msg = admin ? await redefinirSenhaApi(alvo, nova) : await trocarSenhaApi(atual, nova);
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
    "mt-1 w-full rounded-sm border border-line bg-surface-sunken px-3.5 h-12 text-sm text-text outline-none focus:border-brand transition-colors";
  const contaSelecionada = contas.find((c) => c.login === alvo) || null;
  const rotuloAlvo = contaSelecionada
    ? `${NOME_PAPEL[contaSelecionada.papel] || contaSelecionada.nome}${contaSelecionada.login === loginSessao ? " (minha conta)" : ""}`
    : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trocar-senha-titulo"
      className="fixed inset-0 z-50 grid place-items-center bg-surface-overlay p-4"
    >
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-surface-raised shadow-modal p-6">
        <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-line">
          <div className="flex items-center gap-2.5">
            {obrigatorio ? (
              <ShieldWarning size={22} weight="fill" className="text-status-warning-ink shrink-0" />
            ) : (
              <Key size={22} weight="regular" className="text-brand-ink shrink-0" />
            )}
            <h2
              id="trocar-senha-titulo"
              className="font-display text-2xl font-bold tracking-tight text-text"
            >
              {obrigatorio ? "Defina uma nova senha" : admin ? "Redefinir senha" : "Alterar senha"}
            </h2>
          </div>
          {!obrigatorio && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-text-muted hover:text-text hover:bg-surface-hover"
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

        {admin && !obrigatorio && (
          <p className="mt-3 text-xs text-text-muted leading-relaxed">
            Escolha o setor e defina uma nova senha. Não é necessário informar a senha antiga.
          </p>
        )}

        {ok ? (
          <p
            role="status"
            className="mt-5 rounded-sm border border-status-success-border bg-status-success-surface p-3.5 text-xs font-semibold text-status-success-ink"
          >
            {admin && contaSelecionada && contaSelecionada.login !== loginSessao
              ? `Senha de ${rotuloAlvo} redefinida. As sessões anteriores desse setor foram desconectadas.`
              : "Senha alterada. Os outros dispositivos foram desconectados."}
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

            {admin ? (
              <label className="block font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted">
                Setor
                <select
                  name="setor"
                  aria-label="Setor"
                  value={alvo}
                  onChange={(e) => {
                    setAlvo(e.target.value);
                    setErro(null);
                  }}
                  className={campo}
                  disabled={carregandoContas || busy}
                  autoFocus
                >
                  <option value="">{carregandoContas ? "Carregando setores…" : "Selecione o setor"}</option>
                  {contas.map((c) => {
                    const mesmoPapel = contas.filter((o) => o.papel === c.papel).length > 1;
                    const proprio = c.login === loginSessao;
                    return (
                      <option key={c.id} value={c.login}>
                        {NOME_PAPEL[c.papel] || c.nome}
                        {mesmoPapel ? ` · ${c.login}` : ""}
                        {proprio ? " (minha conta)" : ""}
                      </option>
                    );
                  })}
                </select>
                {erroContas && (
                  <span className="mt-2 block font-sans text-xs font-semibold normal-case tracking-normal text-status-danger-ink">
                    {erroContas}{" "}
                    <button type="button" onClick={recarregarContas} className="underline">
                      Tentar novamente
                    </button>
                  </span>
                )}
              </label>
            ) : (
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
            )}

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
              className="mt-2 min-h-12 w-full rounded-sm bg-brand border border-brand text-sm font-bold text-brand-contrast hover:bg-brand-hover disabled:bg-surface-sunken disabled:text-text-muted disabled:border-line disabled:pointer-events-none"
            >
              {busy ? "Salvando…" : admin ? "Redefinir senha" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
