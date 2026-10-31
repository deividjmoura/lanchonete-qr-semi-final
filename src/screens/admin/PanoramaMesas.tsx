import { Clock, Fire, WarningCircle, CaretRight, CheckCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Badge, Btn } from "../../components/ui";
import {
  FAIXAS_TEMPO,
  PERIODOS,
  ROTULO_PERIODO,
  faixaOcupacao,
  filtrarMesas,
  formatarDuracao,
  formatarHora,
  resumoPorPraca,
  resumirMesas,
  resumirVendas,
  type FiltroPraca,
  type FluxoProducao,
  type MesaPanorama,
  type PanoramaMesas as PanoramaResposta,
  type PeriodoPanorama,
  type SetorFluxoId,
} from "../../lib/panorama";
import { BRL } from "../../lib/utils";
import { cn } from "../../utils/cn";

const SETORES: SetorFluxoId[] = ["cozinha", "bar", "garcom"];

type Props = {
  dados: PanoramaResposta;
  filtro: FiltroPraca;
  onFiltro: (filtro: FiltroPraca) => void;
  periodo: PeriodoPanorama;
  onPeriodo: (periodo: PeriodoPanorama) => void;
  onAbrirMesa: (numero: number) => void;
  agora: number;
};

export function PanoramaMesas({ dados, filtro, onFiltro, periodo, onPeriodo, onAbrirMesa, agora }: Props) {
  const mesas = filtrarMesas(dados.mesas, filtro);
  const resumo = resumirMesas(mesas);
  const vendas = resumirVendas(dados.vendas, mesas);
  const pracas = resumoPorPraca(dados.mesas, dados.pracas);
  const filtroAtivo = pracas.find((p) => p.id === filtro);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-line bg-surface-raised p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold tracking-tight text-text">Panorama de mesas</h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Uma entrada por mesa habilitada, inclusive as livres. Tempo contado desde a abertura da sessão.
            </p>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-subtle">
            Atualizado {formatarHora(dados.atualizadoEm)}
          </p>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar panorama por praça">
          <FiltroPraça
            ativo={filtro === "todas"}
            nome="Todas"
            total={dados.mesas.length}
            ocupadas={dados.mesas.filter((m) => m.sessaoId).length}
            criticas={dados.mesas.filter((m) => m.tempo?.id === "critica").length}
            onClick={() => onFiltro("todas")}
          />
          {pracas.map((praca) => (
            <FiltroPraça
              key={String(praca.id)}
              ativo={filtro === praca.id}
              nome={praca.nome}
              total={praca.total}
              ocupadas={praca.ocupadas}
              criticas={praca.criticas}
              onClick={() => onFiltro(praca.id)}
            />
          ))}
        </div>
        {filtroAtivo && (
          <p className="mt-2 text-[11px] text-text-subtle">
            Mostrando {mesas.length} de {dados.mesas.length} mesas · {filtroAtivo.ocupadas} ocupadas ·{" "}
            {filtroAtivo.criticas} em situação crítica.
          </p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo="Consumo em aberto"
          valor={BRL(resumo.saldo)}
          detalhe="Entregue nas mesas abertas e ainda não pago. Não é receita recebida."
          tom="text-status-warning-ink"
          extra={
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-text-subtle">
              consumo entregue {BRL(resumo.consumo)} · já pago {BRL(resumo.pago)}
            </p>
          }
        />
        <Indicador
          rotulo={`Vendas ${ROTULO_PERIODO[periodo]}`}
          valor={BRL(vendas.total)}
          detalhe={`${vendas.contas} ${vendas.contas === 1 ? "conta fechada" : "contas fechadas"} · receita recebida.`}
          tom="text-status-success-ink"
          extra={
            <div className="mt-2 flex gap-1" role="group" aria-label="Período das vendas">
              {PERIODOS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={periodo === p.id}
                  onClick={() => onPeriodo(p.id)}
                  className={cn(
                    "min-h-7 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors",
                    periodo === p.id
                      ? "border-brand-border bg-brand-surface text-brand-ink"
                      : "border-line bg-surface-sunken text-text-muted hover:text-text",
                  )}
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
          }
        />
        <Indicador
          rotulo="Ocupação"
          valor={`${resumo.ocupadas}/${resumo.total}`}
          detalhe={`${resumo.livres} livres · ${resumo.atencao} em atenção · ${resumo.criticas} críticas.`}
          extra={
            <p className="mt-2 flex flex-wrap gap-1 text-[10px]">
              <span className="rounded-full border border-line bg-surface-sunken px-2 py-0.5 font-mono text-text-muted">
                {resumo.recentes} recentes
              </span>
              <span className="rounded-full border border-line bg-surface-sunken px-2 py-0.5 font-mono text-text-muted">
                {resumo.criticas} críticas
              </span>
            </p>
          }
        />
        <Indicador
          rotulo="Em operação"
          valor={`${resumo.pedidosAtivos}`}
          detalhe={`${resumo.pedidosAtivos === 1 ? "pedido ativo" : "pedidos ativos"} nestas mesas · ${resumo.itensNaFila} itens na fila.`}
          extra={
            <p className="mt-2 flex flex-wrap gap-1 text-[10px]">
              <span className="rounded-full border border-line bg-surface-sunken px-2 py-0.5 font-mono text-text-muted">
                {resumo.itensProntosRetirada} prontos p/ retirada
              </span>
            </p>
          }
        />
      </div>

      <TemposDoFluxo fluxo={dados.fluxo} />

      {mesas.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong bg-surface-raised p-8 text-center text-sm text-text-muted">
          Nenhuma mesa nesta praça.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {mesas.map((mesa) => (
            <CartaoMesa
              key={mesa.id}
              mesa={mesa}
              faixas={dados.config.faixas}
              agora={agora}
              onAbrir={() => onAbrirMesa(mesa.numero)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  tom,
  extra,
}: {
  rotulo: string;
  valor: string;
  detalhe: string;
  tom?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-raised p-3.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">{rotulo}</p>
      <p className={cn("mt-1.5 font-display text-2xl font-bold tracking-tight text-text", tom)}>{valor}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-text-subtle">{detalhe}</p>
      {extra}
    </div>
  );
}

function FiltroPraça({
  ativo,
  nome,
  total,
  ocupadas,
  criticas,
  onClick,
}: {
  ativo: boolean;
  nome: string;
  total: number;
  ocupadas: number;
  criticas: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      aria-label={`${nome}: ${ocupadas} ocupadas de ${total}${
        criticas ? `, ${criticas} em situação crítica` : ""
      }`}
      title={`${nome} · ${total} mesas · ${ocupadas} ocupadas${criticas ? ` · ${criticas} críticas` : ""}`}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        ativo
          ? "border-brand-border bg-brand-surface text-brand-ink"
          : "border-line bg-surface-sunken text-text-muted hover:text-text hover:border-line-strong",
      )}
    >
      <span className="flex items-center gap-1.5">
        {criticas > 0 && (
          <WarningCircle
            size={13}
            weight="fill"
            className="text-status-danger-ink"
            aria-label={`${criticas} ${criticas === 1 ? "mesa crítica" : "mesas críticas"}`}
          />
        )}
        {nome}
        {criticas > 0 && <span className="font-mono text-[10px] font-bold text-status-danger-ink">{criticas}</span>}
      </span>
      <span className="font-mono text-[10px] font-bold text-text-subtle">
        {ocupadas}/{total}
      </span>
    </button>
  );
}

function CartaoMesa({
  mesa,
  faixas,
  agora,
  onAbrir,
}: {
  mesa: MesaPanorama;
  faixas: { atencaoMinutos: number; criticoMinutos: number };
  agora: number;
  onAbrir: () => void;
}) {
  const tempo = mesa.abertaEm ? faixaOcupacao(mesa.abertaEm, agora, faixas) : null;
  const faixa = tempo ? FAIXAS_TEMPO[tempo.id] : null;
  const ocupada = Boolean(mesa.sessaoId);
  const critica = tempo?.id === "critica";

  return (
    <article
      data-glass-card
      aria-label={`Mesa ${String(mesa.numero).padStart(2, "0")}: ${ocupada ? "ocupada" : "livre"}${
        faixa ? `, ${faixa.rotulo.toLowerCase()}, ${formatarDuracao(tempo?.minutos)}` : ""
      }`}
      className={cn(
        "flex min-w-0 flex-col rounded-md border bg-surface-raised p-3.5 transition-colors",
        critica ? "border-status-danger-border" : ocupada ? "border-line-strong" : "border-line",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xl font-extrabold leading-none tracking-tight text-text">
            {String(mesa.numero).padStart(2, "0")}
            <span className="ml-1.5 font-sans text-[10px] font-bold uppercase tracking-wider text-text-muted">mesa</span>
          </p>
          <p className="mt-1 truncate text-[11px] text-text-muted">{mesa.pracaNome || "Sem praça"}</p>
        </div>
        <Badge tone={ocupada ? "brass" : "sage"} dot>
          {ocupada ? "Ocupada" : "Livre"}
        </Badge>
      </header>

      {ocupada ? (
        <>
          <div
            className={cn(
              "mt-2.5 flex items-center justify-between gap-2 rounded-sm border px-2.5 py-1.5",
              faixa?.classe || "border-line bg-surface-sunken text-text-muted",
            )}
          >
            <span className="flex items-center gap-1.5 font-mono text-xs font-bold">
              <Clock size={13} weight="bold" />
              {formatarDuracao(tempo?.minutos)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider">{faixa?.rotulo || "Sem horário"}</span>
          </div>

          <dl className="mt-2.5 space-y-1.5 text-[11px]">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-muted">Garçom</dt>
              <dd className="min-w-0 truncate font-semibold text-text">
                {mesa.garcomResponsavelNome || "a definir"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-muted">Cliente</dt>
              <dd className="min-w-0 truncate text-text">{mesa.clienteNome || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-muted">Aberta</dt>
              <dd className="font-mono text-text">
                {formatarHora(mesa.abertaEm)}
                {mesa.pedidosAtivos > 0 && (
                  <span className="ml-1.5 text-text-muted">
                    · {mesa.pedidosAtivos} {mesa.pedidosAtivos === 1 ? "pedido" : "pedidos"}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {mesa.pedidosAtivos > 0 && (
            <div className="mt-2 flex flex-wrap gap-1" aria-label="Pedidos ativos por etapa">
              {mesa.pedidosRecebidos > 0 && <Etiqueta>{mesa.pedidosRecebidos} na fila</Etiqueta>}
              {mesa.pedidosPreparo > 0 && <Etiqueta>{mesa.pedidosPreparo} em preparo</Etiqueta>}
              {mesa.pedidosProntos > 0 && <Etiqueta tom="success">{mesa.pedidosProntos} pronto(s)</Etiqueta>}
              {mesa.itensNaFila > 0 && <Etiqueta>{mesa.itensNaFila} item(ns) na fila</Etiqueta>}
            </div>
          )}

          <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-dashed border-line pt-2.5">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Consumo em aberto</p>
              <p className="font-mono text-sm font-bold text-status-warning-ink">{BRL(mesa.saldo)}</p>
              <p className="text-[10px] leading-relaxed text-text-subtle">
                entregue {BRL(mesa.consumo)}
                {mesa.pago > 0 ? ` · já pago ${BRL(mesa.pago)}` : ""}
              </p>
            </div>
            <Btn size="sm" variant="outline" onClick={onAbrir} className="shrink-0 px-2.5">
              Abrir <CaretRight size={13} weight="bold" />
            </Btn>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 flex-1 text-[11px] leading-relaxed text-text-subtle">
            Nenhuma sessão aberta. Mesa disponível para check-in pelo QR ou início de atendimento pelo garçom.
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-line pt-2.5">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              <CheckCircle size={13} weight="bold" /> sem consumo
            </span>
            <Btn size="sm" variant="outline" onClick={onAbrir} className="shrink-0 px-2.5">
              Abrir <CaretRight size={13} weight="bold" />
            </Btn>
          </div>
        </>
      )}
    </article>
  );
}

function Etiqueta({ children, tom }: { children: ReactNode; tom?: "success" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold",
        tom === "success"
          ? "border-status-success-border bg-status-success-surface text-status-success-ink"
          : "border-line bg-surface-sunken text-text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function TemposDoFluxo({ fluxo }: { fluxo: FluxoProducao }) {
  return (
    <section aria-label="Tempos do fluxo" className="rounded-md border border-line bg-surface-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-text">
            <Fire size={18} weight="fill" className="text-brand-ink" /> Tempos do fluxo
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Recebimento → início do preparo, início → pronto, pronto → retirada e retirada → entrega, por setor.
            Média por item nas últimas {fluxo.janela.horas} h, usando somente horários reais registrados.
          </p>
        </div>
        {fluxo.janela.desde && fluxo.janela.ate && (
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-subtle">
            {formatarHora(fluxo.janela.desde)} — {formatarHora(fluxo.janela.ate)}
          </p>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {fluxo.etapas.map((etapa) => (
          <div key={etapa.id} className="rounded-sm border border-line bg-surface-sunken p-3">
            <p className="text-xs font-semibold text-text">{etapa.rotulo}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{etapa.descricao}</p>
            <ul className="mt-2.5 space-y-2">
              {SETORES.map((setorId) => {
                const setor = fluxo.setores[setorId];
                const medida = setor.etapas[etapa.id];
                return (
                  <li key={setorId} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      {setor.rotulo}
                    </span>
                    {!medida.aplicavel ? (
                      <span className="text-[11px] text-text-subtle" aria-label="Não se aplica">—</span>
                    ) : medida.disponivel ? (
                      <span className="flex items-center gap-1.5">
                        <strong className="font-mono text-xs font-bold text-text">
                          {formatarDuracao(medida.minutos)}
                        </strong>
                        <span className="text-[10px] text-text-subtle" title="Itens usados na média">
                          n={medida.amostras}
                        </span>
                        {medida.aproximado && (
                          <span
                            className="rounded-full border border-status-warning-border bg-status-warning-surface px-1.5 py-0 font-mono text-[9px] font-bold text-status-warning-ink"
                            title={`Amostra menor que ${fluxo.amostraMinima} itens: valor aproximado`}
                          >
                            aprox.
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[11px] text-text-subtle">Indisponível</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-text-subtle">
        Sem horário completo a etapa fica indisponível — nenhum tempo é deduzido do status atual. Entregas diretas
        (pronto direto para a mesa) não têm retirada registrada e não entram em “pronto → retirada”. Amostras menores
        que {fluxo.amostraMinima} itens aparecem como aproximadas e passos acima de {fluxo.limiteEtapaHoras} h são
        descartados como dado antigo.
      </p>
    </section>
  );
}
