import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowClockwise,
  BeerStein,
  CashRegister,
  CookingPot,
  Key,
  ShieldCheck,
  SignIn,
  SquaresFour,
  WarningCircle,
  EnvelopeSimple,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "../components/ui";
import { ir } from "../router";
import { usePub } from "../store/usePub";
import { cn } from "../utils/cn";
import "./login-fields.css";

const PAPEIS = [
  { id: "cozinha", nome: "Cozinha", desc: "Fila da chapa", Icon: CookingPot },
  { id: "bar", nome: "Bar", desc: "Chopes e bebidas", Icon: BeerStein },
  { id: "caixa", nome: "Caixa", desc: "Contas e PIX", Icon: CashRegister },
  { id: "admin", nome: "Admin", desc: "Gestão e salão", Icon: SquaresFour },
] as const;

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

  const loginApi = usePub((s) => s.loginApi);
  const concluirSegundoFatorApi = usePub((s) => s.concluirSegundoFatorApi);
  const cancelarSegundoFatorApi = usePub((s) => s.cancelarSegundoFatorApi);
  /* #55: em qual etapa do login estamos. `pendente` = a senha já foi aceita e
     o servidor não liberou nenhuma sessão; falta o segundo fator. */
  const [etapa, setEtapa] = useState<"credencial" | "segundo-fator">("credencial");
  const [codigo2fa, setCodigo2fa] = useState("");
  const [erro2fa, setErro2fa] = useState<string | null>(null);
  const [viaRecuperacao, setViaRecuperacao] = useState(false);
  const [papel, setPapel] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    const fragmentQuery = window.location.hash.split("?")[1] || "";
    const params = new URLSearchParams(fragmentQuery);
    const codigo = params.get("google_error");
    if (codigo) {
      const mensagens: Record<string, string> = {
        access_denied: "O acesso com Google foi cancelado.",
        login_failed: "Não foi possível entrar com esta conta Google. Confira se o e-mail está cadastrado para um funcionário ativo.",
      };
      setGoogleError(mensagens[codigo] || "Falha na autenticação com Google. Tente novamente.");
      window.history.replaceState({}, document.title, window.location.pathname + "#/login");
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    fetch("/api/auth/google/status")
      .then((r) => r.ok ? r.json() : { enabled: false })
      .then((data) => { if (ativo) setGoogleEnabled(data.enabled === true); })
      .catch(() => { if (ativo) setGoogleEnabled(false); });
    return () => { ativo = false; };
  }, []);
  const reduceMotion = useReducedMotion();

  const destinoDoPapel = (role: string) =>
    role === "admin" ? "/admin" : role === "cozinha" ? "/cozinha" : role === "bar" ? "/bar" : "/caixa";

  const entrar = async () => {
    if (!papel || busy) return;
    setBusy(true);
    const resultado = await loginApi(papel, senha);
    setBusy(false);

    if (!resultado.ok && resultado.motivo === "mfa") {
      // A senha está certa, mas NÃO existe sessão utilizável: o servidor só
      // emitiu um cookie pendente de 5 minutos. A identidade nem foi revelada.
      setEtapa("segundo-fator");
      setCodigo2fa("");
      setErro2fa(null);
      return;
    }
    if (!resultado.ok) {
      setErro(true);
      setTimeout(() => setErro(false), 1600);
      return;
    }
    ir(destinoDoPapel(resultado.role));
  };

  const confirmarSegundoFator = async () => {
    if (busy) return;
    const codigo = codigo2fa.trim();
    if (!codigo) {
      setErro2fa("Digite o código de 6 dígitos ou um código de recuperação.");
      return;
    }
    setBusy(true);
    const r = await concluirSegundoFatorApi(codigo);
    setBusy(false);
    if (!r.ok) {
      setErro2fa(r.erro);
      setCodigo2fa("");
      return;
    }
    const papelAtual = usePub.getState().auth?.role;
    ir(papelAtual ? destinoDoPapel(papelAtual) : "/");
  };

  const voltarParaCredencial = async () => {
    await cancelarSegundoFatorApi();
    setEtapa("credencial");
    setSenha("");
    setCodigo2fa("");
    setErro2fa(null);
    setViaRecuperacao(false);
  };

  const ativo = PAPEIS.find((p) => p.id === papel);

  return (
    <div
      ref={paginaRef}
      data-regime="expressive"
      className="login-page login-viewport flex h-[100dvh] min-h-0 flex-col overflow-hidden p-3 sm:p-5 bg-surface text-text"
    >
      <header className="login-header mx-auto flex w-full max-w-6xl justify-end" aria-hidden="true" />

      <main className="login-main my-auto flex min-h-0 flex-1 items-center justify-center py-2 sm:py-3">
        <motion.section
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1.18, 0.36, 1] }}
          aria-labelledby="login-titulo"
          className="login-card login-panel w-full max-w-lg overflow-hidden"
        >
          {/* Cabeçalho da comanda de acesso */}
          <div className="login-brand mb-9 flex flex-col items-center text-center">
            <img
              src="/logo/qradmin-mark.png"
              alt="QR Admin"
              width="104"
              height="104"
              className="mb-4 h-24 w-24 object-contain sm:h-28 sm:w-28"
              draggable={false}
            />
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-ink">
              QR Admin
            </p>
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

          <div className="login-card-content login-content mx-auto w-full max-w-md">
            {etapa === "credencial" && (
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted mb-3">
                Selecione o setor
              </p>
            )}
            <div className={cn("login-sectors grid grid-cols-2 sm:grid-cols-4 gap-2.5", etapa !== "credencial" && "hidden")}>
              {PAPEIS.map((p) => {
                const selecionado = papel === p.id;
                const Icon = p.Icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={selecionado}
                    onClick={() => {
                      setPapel(p.id);
                      setErro(false);
                    }}
                    className={cn(
                      "login-sector-button min-h-24 rounded-lg px-2.5 py-4 flex flex-col items-center justify-center gap-2 text-center transition-colors duration-150",
                      selecionado
                        ? "is-selected bg-brand-surface text-brand-ink"
                        : "text-text-muted hover:text-text hover:bg-surface-hover",
                    )}
                  >
                    <Icon size={22} weight={selecionado ? "fill" : "regular"} />
                    <span className="font-display text-sm font-bold tracking-tight leading-none mt-0.5">
                      {p.nome}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {etapa === "segundo-fator" && (
                <motion.div
                  key="segundo-fator"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
                >
                  <form
                    className="login-form mt-7 space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void confirmarSegundoFator();
                    }}
                  >
                    <div className="flex items-start gap-2.5 rounded-sm border border-line bg-surface-sunken px-3 py-2.5">
                      <ShieldCheck size={18} weight="fill" className="text-brand shrink-0 mt-0.5" />
                      <p className="text-xs leading-relaxed text-text-muted">
                        A senha foi aceita. Por segurança, esta conta exige um{" "}
                        <strong className="text-text">segundo fator</strong> antes de liberar o
                        acesso.
                      </p>
                    </div>

                    <label htmlFor="login-2fa" className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                        {viaRecuperacao ? "Código de recuperação" : "Código do autenticador"}
                      </span>
                      <span
                        className={cn(
                          "login-credential flex h-12 items-center gap-2.5 border-b bg-transparent px-1 transition-colors",
                          erro2fa ? "border-status-danger-border" : "border-line-strong focus-within:border-brand",
                        )}
                      >
                        <Key
                          size={18}
                          className={erro2fa ? "shrink-0 text-status-danger-ink" : "shrink-0 text-text-muted"}
                        />
                        <input
                          id="login-2fa"
                          name="codigo"
                          // `one-time-code` deixa o iOS/Android sugerir o código do app.
                          autoComplete="one-time-code"
                          inputMode={viaRecuperacao ? "text" : "numeric"}
                          value={codigo2fa}
                          onChange={(e) => {
                            setCodigo2fa(e.target.value);
                            setErro2fa(null);
                          }}
                          placeholder={viaRecuperacao ? "xxxx-xxxx-xx" : "000000"}
                          aria-describedby="login-2fa-ajuda"
                          className={cn(
                            "h-full flex-1 bg-transparent text-sm text-text placeholder:text-text-subtle focus:outline-none",
                            !viaRecuperacao && "tracking-[0.35em] font-mono",
                          )}
                        />
                      </span>
                    </label>

                    {erro2fa && (
                      <p
                        role="alert"
                        className="flex items-center gap-2 rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs font-semibold text-status-danger-ink"
                      >
                        <WarningCircle size={16} weight="fill" className="shrink-0" />
                        {erro2fa}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-bold text-brand-contrast transition-colors duration-150 hover:bg-brand-hover active:translate-y-px disabled:opacity-45"
                    >
                      <ShieldCheck size={18} weight="bold" />
                      {busy ? "Verificando…" : "Confirmar código"}
                    </button>

                    <p id="login-2fa-ajuda" className="text-center text-[11px] text-text-muted">
                      Abra o app autenticador e use o código de 6 dígitos. Perdeu o aparelho?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setViaRecuperacao((v) => !v);
                          setCodigo2fa("");
                          setErro2fa(null);
                        }}
                        className="font-semibold text-brand-ink underline-offset-2 hover:underline"
                      >
                        {viaRecuperacao ? "usar o autenticador" : "usar um código de recuperação"}
                      </button>
                    </p>

                    <button
                      type="button"
                      onClick={() => void voltarParaCredencial()}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm px-2 py-2 text-xs font-semibold text-text-muted transition-colors hover:text-text"
                    >
                      <ArrowClockwise size={14} weight="bold" /> Recomeçar o login
                    </button>
                  </form>
                </motion.div>
              )}

              {etapa === "credencial" && papel && ativo && (
                <motion.div
                  key={papel}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
                >
                <form
                  className="mt-5 pt-5 border-t border-line space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void entrar();
                  }}
                >
                  <input
                    type="text"
                    name="username"
                    id="login-usuario"
                    autoComplete="username"
                    value={papel}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                  />

                  <label htmlFor="login-senha" className="block">
                    <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1.5">
                      <span>Credencial · {ativo.nome}</span>
                      <span>{ativo.desc}</span>
                    </span>
                    <span
                      className={cn(
                        "login-credential flex items-center gap-2.5 border-b bg-transparent px-1 h-12 transition-colors",
                        erro
                          ? "border-status-danger-border"
                          : "border-line-strong focus-within:border-brand",
                      )}
                    >
                      <Key
                        size={18}
                        weight="regular"
                        className={erro ? "text-status-danger-ink shrink-0" : "text-text-muted shrink-0"}
                      />
                      <input
                        type="password"
                        name="password"
                        id="login-senha"
                        autoComplete="current-password"
                        value={senha}
                        onChange={(e) => {
                          setSenha(e.target.value);
                          setErro(false);
                        }}
                        placeholder={`Senha de ${ativo.nome.toLowerCase()}`}
                        className="flex-1 bg-transparent text-sm text-text placeholder:text-text-subtle focus:outline-none h-full"
                      />
                    </span>
                  </label>

                  {erro && (
                    <p
                      role="alert"
                      className="flex items-center gap-2 rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs font-semibold text-status-danger-ink"
                    >
                      <WarningCircle size={16} weight="fill" className="shrink-0" />
                      Senha incorreta — confira e tente novamente.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-12 rounded-md bg-brand px-5 text-brand-contrast font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-brand-hover active:translate-y-px disabled:opacity-45 transition-colors duration-150"
                  >
                    <SignIn size={18} weight="bold" />
                    {busy ? "Autenticando…" : `Entrar em ${ativo.nome}`}
                  </button>
                </form>
                </motion.div>
              )}
            </AnimatePresence>

            {googleError && <p role="alert" className="mt-4 rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs font-semibold text-status-danger-ink">{googleError}</p>}

            {googleEnabled && etapa === "credencial" && (
              <div className="login-google mt-7">
                <button
                  type="button"
                  onClick={() => { window.location.assign("/api/auth/google"); }}
                  className="w-full min-h-12 rounded-md bg-surface-hover/70 text-text font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-surface-hover transition-colors"
                >
                  <span aria-hidden="true" className="font-bold text-base">G</span>
                  Continuar com Google
                </button>
                <p className="mt-2 text-center text-[11px] text-text-muted">
                  Disponível somente para contas de funcionários previamente vinculadas.
                </p>
              </div>
            )}
          </div>
        </motion.section>
      </main>

      <footer className="login-footer mx-auto w-full max-w-6xl">
        <div className="login-footer-inner flex flex-col items-center justify-between gap-2 sm:flex-row">
          <div className="login-footer-legal flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="/termos-de-uso.html" className="login-footer-text-link">Termos de uso</a>
            <a href="/politica-de-privacidade.html" className="login-footer-text-link">Política de privacidade</a>
            <span className="text-xs text-text-muted">© {new Date().getFullYear()} QR Admin. Todos os direitos reservados.</span>
          </div>
          <nav aria-label="Contato e aparência" className="flex items-center gap-1">
            <a className="login-footer-link" href="https://wa.me/5547996162721" target="_blank" rel="noopener noreferrer" aria-label="Contato pelo WhatsApp" title="WhatsApp">
              <WhatsappLogo size={19} weight="regular" />
            </a>
            <a className="login-footer-link" href="mailto:dejesusdemouradeivid@gmail.com" aria-label="Contato por e-mail" title="E-mail">
              <EnvelopeSimple size={18} weight="regular" />
            </a>
            <ThemeToggle className="login-icon-action" />
          </nav>
        </div>
      </footer>
    </div>
  );
}
