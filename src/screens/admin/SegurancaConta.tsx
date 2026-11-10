import { QRCodeSVG } from "qrcode.react";
import {
  CheckCircle,
  Copy,
  Key,
  LockKey,
  ShieldCheck,
  ShieldSlash,
  ShieldWarning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Btn } from "../../components/ui";
import { api } from "../../lib/api";
import { QR_SVG_COLORS } from "../../lib/tema";
import { usePub } from "../../store/usePub";
import { cn } from "../../utils/cn";

/**
 * #55 — 2FA da própria conta.
 *
 * Duas regras de produto que a tela precisa respeitar:
 *
 *  1. O 2FA só liga depois que a pessoa prova um código válido. Se ela fechar a
 *     janela no meio, nada muda na conta (o servidor só grava o segredo na
 *     confirmação).
 *  2. Os 10 códigos de recuperação aparecem UMA vez. Depois disso não há como
 *     recuperá-los — só gerar outros. Por isso o passo de confirmação ("salvei
 *     os códigos") existe e bloqueia o fechamento do painel.
 */
type Estado = { ativo: boolean; ativadoEm: string | null; codigosRestantes: number; disponivel: boolean };

type Passo =
  | { tipo: "fechado" }
  | { tipo: "iniciando" }
  | { tipo: "confirmar"; segredo: string; uri: string }
  | { tipo: "codigos"; codigos: string[] }
  | { tipo: "desativando" };

export function SegurancaConta() {
  const reportarErro = usePub((s) => s.reportarErro);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [passo, setPasso] = useState<Passo>({ tipo: "fechado" });
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [salveiCodigos, setSalveiCodigos] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setEstado(await api.estado2fa());
    } catch (e: any) {
      setErro(e?.message || "Não foi possível consultar o estado do 2FA.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const iniciar = async () => {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const out = await api.iniciar2fa();
      setPasso({ tipo: "confirmar", segredo: out.segredo, uri: out.uri });
      setCodigo("");
    } catch (e: any) {
      setErro(e?.message || "Não foi possível iniciar a configuração.");
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async () => {
    if (passo.tipo !== "confirmar") return;
    setErro(null);
    setOcupado(true);
    try {
      const out = await api.ativar2fa(passo.segredo, codigo.trim());
      setPasso({ tipo: "codigos", codigos: out.codigosRecuperacao });
      setSalveiCodigos(false);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Código inválido. Confira o relógio do aparelho.");
      setCodigo("");
    } finally {
      setOcupado(false);
    }
  };

  const desativar = async () => {
    setErro(null);
    setOcupado(true);
    try {
      const out = await api.desativar2fa(senha);
      setPasso({ tipo: "fechado" });
      setSenha("");
      setAviso(
        out.sessoesRevogadas > 0
          ? `2FA desativado. ${out.sessoesRevogadas} outra(s) sessão(ões) foram encerradas.`
          : "2FA desativado.",
      );
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Não foi possível desativar o 2FA.");
    } finally {
      setOcupado(false);
    }
  };

  const copiarCodigos = async () => {
    if (passo.tipo !== "codigos") return;
    try {
      await navigator.clipboard.writeText(passo.codigos.join("\n"));
      reportarErro(null);
      setAviso("Códigos copiados para a área de transferência.");
    } catch {
      setAviso("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  if (carregando && !estado) {
    return (
      <section className="rounded-md border border-line bg-surface-raised p-5">
        <p role="status" className="text-xs text-text-muted">
          Consultando o 2FA desta conta…
        </p>
      </section>
    );
  }

  // Tela de códigos de recuperação — ocupa o painel até a pessoa confirmar.
  if (passo.tipo === "codigos") {
    return (
      <section className="rounded-md border border-brand bg-surface-raised p-5">
        <h3 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-text">
          <ShieldCheck size={22} weight="fill" className="text-brand" />
          2FA ativado
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          Guarde estes <strong className="text-text">10 códigos de recuperação</strong>. Cada um
          entra <em>uma vez</em>, no lugar do app autenticador. Eles aparecem só agora: não há como
          vê-los de novo depois.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {passo.codigos.map((c, i) => (
            <div
              key={c}
              className="flex items-center gap-2 rounded-sm border border-line bg-surface-sunken px-3 py-2"
            >
              <span className="w-5 shrink-0 font-mono text-[11px] text-text-subtle">
                {String(i + 1).padStart(2, "0")}
              </span>
              <code className="flex-1 font-mono text-[13px] tracking-wide text-text">{c}</code>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn size="sm" variant="secondary" onClick={() => void copiarCodigos()}>
            <Copy size={15} /> Copiar todos
          </Btn>
        </div>

        {aviso && (
          <p role="status" className="mt-3 text-xs font-semibold text-brand-ink">
            {aviso}
          </p>
        )}

        <label className="mt-4 flex items-start gap-2.5 rounded-sm border border-line bg-surface-sunken px-3 py-2.5">
          <input
            type="checkbox"
            checked={salveiCodigos}
            onChange={(e) => setSalveiCodigos(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
          />
          <span className="text-xs leading-relaxed text-text-muted">
            Guardei os códigos em um lugar seguro (papel, gerenciador de senhas) — se eu perder o
            aparelho e os códigos, precisarei de outro administrador para recuperar o acesso.
          </span>
        </label>

        <Btn
          className="mt-4"
          disabled={!salveiCodigos}
          onClick={() => {
            setPasso({ tipo: "fechado" });
            setAviso("2FA ativado nesta conta. No próximo login será pedido o código do app.");
          }}
        >
          <CheckCircle size={16} weight="fill" /> Concluir
        </Btn>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-line bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-text">
            <LockKey size={22} weight="fill" className="text-brand" />
            Verificação em duas etapas
          </h3>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-text-muted">
            Além da senha, o login desta conta pede um código de 6 dígitos de um app autenticador
            (Google Authenticator, Authy, 1Password…). Vale a pena porque a senha do admin dá acesso
            a preços, cardápio e relatórios.
          </p>
        </div>
        {estado && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xs border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
              estado.ativo
                ? "border-status-success-border bg-status-success-surface text-status-success-ink"
                : "border-line-strong bg-surface-sunken text-text-muted",
            )}
          >
            {estado.ativo ? <ShieldCheck size={13} weight="fill" /> : <ShieldSlash size={13} weight="bold" />}
            {estado.ativo ? "Ativo" : "Inativo"}
          </span>
        )}
      </div>

      {!estado?.disponivel && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-sm border border-status-warning-border bg-status-warning-surface px-3 py-2 text-xs font-semibold text-status-warning-ink"
        >
          <ShieldWarning size={16} weight="fill" className="mt-px shrink-0" />
          O servidor não tem a chave de cifra configurada (<code className="font-mono">TOTP_ENC_KEY</code>),
          então o 2FA não pode ser ativado. Fale com quem administra o deploy.
        </p>
      )}

      {erro && (
        <p
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs font-semibold text-status-danger-ink"
        >
          <WarningCircle size={16} weight="fill" className="shrink-0" />
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="mt-4 text-xs font-semibold text-brand-ink">
          {aviso}
        </p>
      )}

      {/* ---------------- ativo ---------------- */}
      {estado?.ativo && passo.tipo === "fechado" && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-sm border border-line bg-surface-sunken px-3 py-2.5 text-xs">
            <span className="text-text-muted">
              Códigos de recuperação restantes:{" "}
              <strong className={cn("font-mono", estado.codigosRestantes <= 2 ? "text-status-danger-ink" : "text-text")}>
                {estado.codigosRestantes}
              </strong>
            </span>
            {estado.ativadoEm && (
              <span className="text-text-muted">
                Ativado em{" "}
                <strong className="font-mono text-text">
                  {new Date(estado.ativadoEm).toLocaleDateString("pt-BR")}
                </strong>
              </span>
            )}
          </div>

          {estado.codigosRestantes === 0 && (
            <p className="flex items-start gap-2 rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs font-semibold text-status-danger-ink">
              <WarningCircle size={16} weight="fill" className="mt-px shrink-0" />
              Não há mais códigos de recuperação. Se você perder o aparelho, precisará de outro
              administrador. Desative e ative de novo para gerar 10 novos.
            </p>
          )}

          <Btn size="sm" variant="danger" onClick={() => { setPasso({ tipo: "desativando" }); setErro(null); setAviso(null); }}>
            <ShieldSlash size={15} weight="bold" /> Desativar 2FA
          </Btn>
        </div>
      )}

      {/* ---------------- desativar (pede a senha) ---------------- */}
      {passo.tipo === "desativando" && (
        <form
          className="mt-4 space-y-3 rounded-sm border border-status-danger-border bg-status-danger-surface/40 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void desativar();
          }}
        >
          <p className="text-xs leading-relaxed text-text-muted">
            Desativar deixa a conta protegida apenas pela senha. Confirme com a sua senha atual —
            é a mesma proteção usada na troca de senha.
          </p>
          <input
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha atual"
            aria-label="Senha atual"
            className="block h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle focus:border-brand focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" variant="danger" disabled={ocupado || !senha}>
              {ocupado ? "Desativando…" : "Confirmar desativação"}
            </Btn>
            <Btn
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setPasso({ tipo: "fechado" });
                setSenha("");
                setErro(null);
              }}
            >
              Cancelar
            </Btn>
          </div>
        </form>
      )}

      {/* ---------------- inativo ---------------- */}
      {estado && !estado.ativo && passo.tipo === "fechado" && (
        <div className="mt-4">
          <Btn size="sm" disabled={!estado.disponivel || ocupado} onClick={() => void iniciar()}>
            <ShieldCheck size={15} weight="fill" /> Ativar 2FA
          </Btn>
        </div>
      )}

      {/* ---------------- confirmar código ---------------- */}
      {passo.tipo === "confirmar" && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <p className="text-xs leading-relaxed text-text-muted">
            <strong className="text-text">1.</strong> Abra o app autenticador e escaneie o código.
            <strong className="text-text"> 2.</strong> Digite o código de 6 dígitos que aparecer.
            O 2FA só liga depois desta confirmação.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="qr-quiet-zone mx-auto sm:mx-0">
              <QRCodeSVG
                value={passo.uri}
                size={148}
                level="M"
                title="QR do 2FA"
                fgColor={QR_SVG_COLORS.fg}
                bgColor={QR_SVG_COLORS.bg}
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                Não consegue escanear? Digite a chave
              </p>
              <code className="block break-all rounded-sm border border-line bg-surface-sunken px-3 py-2 font-mono text-xs text-text">
                {passo.segredo}
              </code>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void confirmar();
                }}
              >
                <input
                  value={codigo}
                  onChange={(e) => {
                    setCodigo(e.target.value);
                    setErro(null);
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="000000"
                  aria-label="Código de 6 dígitos do app"
                  className="h-11 w-32 rounded-sm border border-line-strong bg-surface px-3 font-mono text-base tracking-[0.3em] text-text placeholder:text-text-subtle focus:border-brand focus:outline-none"
                />
                <Btn size="sm" disabled={ocupado || codigo.trim().length < 6}>
                  {ocupado ? "Verificando…" : "Confirmar e ativar"}
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setPasso({ tipo: "fechado" });
                    setCodigo("");
                    setErro(null);
                  }}
                >
                  <Key size={14} /> Cancelar
                </Btn>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
