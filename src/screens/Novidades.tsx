import { ArrowClockwise, CheckCircle, Sparkle } from "@phosphor-icons/react";
import { OpsShell } from "../components/OpsShell";
import { Btn } from "../components/ui";
import { ir } from "../router";
import {
  formatarDataDaNota,
  notasDeVersao,
  notasDepoisDe,
  VERSAO_DO_APP,
} from "../lib/notasVersao";

/**
 * "O que mudou" — a tela de novidades do sistema (#301).
 *
 * Existe porque o aviso de nova versão é passageiro: quem adia, ou quem chega
 * depois do deploy, precisa de um lugar estável para ver o que mudou. A lista
 * não é escrita aqui: vem de `public/novidades.json` (mesma fonte do aviso e do
 * aplicativo do garçom), então esta tela nunca fica desatualizada em relação ao
 * que o sistema anunciou.
 *
 * Regra de honestidade: a nota só aparece como "chegou agora" se a versão dela
 * for posterior à versão embutida neste build. Não há data de leitura nem
 * "visto" por operador: é informação, não caixa de entrada.
 */
export default function Novidades() {
  const versaoEmExecucao = VERSAO_DO_APP;
  const todas = notasDeVersao();
  const novas = new Set(notasDepoisDe(versaoEmExecucao, todas).map((nota) => nota.versao));

  return (
    <OpsShell
      ativo="novidades"
      kicker="Sistema · Versão"
      titulo="O que mudou"
      extra={
        <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
          <Sparkle size={13} aria-hidden="true" /> versão {versaoEmExecucao}
        </span>
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-4">
        <section className="rounded-xl border border-line bg-surface-raised p-4">
          <h2 className="text-sm font-semibold text-text">Como funciona o aviso de atualização</h2>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Quando um deploy publica uma versão nova, a tela que está aberta mostra um aviso discreto com
            as novidades abaixo. Nada recarrega sozinho: você escolhe <strong>Atualizar agora</strong> ou{" "}
            <strong>Continuar por enquanto</strong>, e o trabalho em andamento continua como está.
          </p>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
              <dt className="font-semibold text-text">Painel</dt>
              <dd className="text-text-muted">Cozinha, bar, caixa e administração avisam ao mudar.</dd>
            </div>
            <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
              <dt className="font-semibold text-text">Garçom</dt>
              <dd className="text-text-muted">O aplicativo do garçom avisa pelo mesmo mecanismo.</dd>
            </div>
            <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
              <dt className="font-semibold text-text">Adiado</dt>
              <dd className="text-text-muted">Continua valendo até a próxima versão publicada.</dd>
            </div>
          </dl>
        </section>

        <ol className="flex flex-col gap-3">
          {todas.map((nota) => (
            <li
              key={nota.versao}
              className="rounded-xl border border-line bg-surface-raised p-4"
              aria-label={`Versão ${nota.versao}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-2 py-0.5 font-mono text-[11px] font-bold text-text">
                  v{nota.versao}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">{formatarDataDaNota(nota.data)}</span>
                {novas.has(nota.versao) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand-ink">
                    <CheckCircle size={12} weight="fill" aria-hidden="true" /> chegou agora
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-sm font-semibold text-text">{nota.titulo}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{nota.resumo}</p>
              {nota.itens?.length ? (
                <ul className="mt-2 ml-4 list-disc space-y-1 text-xs leading-relaxed text-text-muted">
                  {nota.itens.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>

        {todas.length === 0 && (
          <p className="rounded-xl border border-line bg-surface-raised p-4 text-xs text-text-muted">
            Ainda não há novidades registradas nesta instalação.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="outline" onClick={() => ir("/")}>
            Voltar
          </Btn>
          <Btn
            variant="ghost"
            onClick={() => {
              // Recarrega de propósito: é o mesmo caminho do "Atualizar agora" do
              // aviso, sem depender de haver versão pendente detectada.
              window.location.reload();
            }}
          >
            <ArrowClockwise size={15} weight="bold" aria-hidden="true" /> Recarregar a tela
          </Btn>
        </div>
      </div>
    </OpsShell>
  );
}
