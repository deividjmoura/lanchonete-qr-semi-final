import { Copy, LinkSimple, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge, Btn } from "../../components/ui";
import { api } from "../../lib/api";
import { mesaClienteUrl } from "../../lib/mesaUrl";
import {
  FAIXAS_TEMPO,
  faixaOcupacao,
  formatarDuracao,
  type MesaPanorama,
  type PanoramaMesas as PanoramaResposta,
} from "../../lib/panorama";
import { BRL } from "../../lib/utils";
import { usePub } from "../../store/usePub";
import { cn } from "../../utils/cn";
import { QrDownloadButton } from "./QrDownloadButton";

type Props = {
  dados: PanoramaResposta;
  agora: number;
  onAbrirMesa: (numero: number) => void;
  onAtualizado: () => void;
  onErro: (mensagem: string | null) => void;
};

export function MapaQrMesas({ dados, agora, onAbrirMesa, onAtualizado, onErro }: Props) {
  const { quantidade, limite, faixas } = dados.config;
  const [numero, setNumero] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [copiado, setCopiado] = useState<number | null>(null);

  const abrirPorNumero = () => {
    const n = Number(numero);
    if (!Number.isSafeInteger(n) || n < 1 || n > limite) {
      onErro(`Informe o número de uma mesa entre 1 e ${limite}.`);
      return;
    }
    if (n > quantidade) {
      onErro(`A mesa ${n} ainda não está habilitada — hoje há ${quantidade} mesas ativas.`);
      return;
    }
    onErro(null);
    onAbrirMesa(n);
  };

  const adicionarMesas = async () => {
    const restante = limite - quantidade;
    if (restante <= 0) return;
    const resposta = prompt(`Quantas mesas deseja adicionar? (1 a ${restante})`, String(Math.min(10, restante)));
    if (resposta === null) return;
    const extra = Number(resposta);
    if (!Number.isSafeInteger(extra) || extra < 1 || extra > restante) {
      onErro(`Informe uma quantidade inteira entre 1 e ${restante}.`);
      return;
    }
    setAdicionando(true);
    onErro(null);
    try {
      await api.ativarMesas(quantidade + extra);
      onAtualizado();
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Falha ao ativar mesas");
    } finally {
      setAdicionando(false);
    }
  };

  const copiarLink = async (mesa: MesaPanorama) => {
    const url = mesaClienteUrl(mesa.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(mesa.id);
      setTimeout(() => setCopiado((atual) => (atual === mesa.id ? null : atual)), 2000);
    } catch {
      prompt("Copie o link da mesa:", url);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface-raised p-4 sm:p-5">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-bold tracking-tight text-text">Mapa de mesas e QR Codes</h3>
          <p className="mt-0.5 font-mono text-xs text-text-muted">
            {quantidade} ativas · teto {limite}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Nº da mesa
            <input
              type="number"
              min={1}
              max={limite}
              inputMode="numeric"
              value={numero}
              placeholder="Ex.: 12"
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") abrirPorNumero();
              }}
              className="mt-1 block h-10 w-24 rounded-sm border border-line-strong bg-surface-sunken px-3 font-mono text-sm text-text"
            />
          </label>
          <Btn size="sm" variant="outline" onClick={abrirPorNumero}>
            <LinkSimple size={15} weight="bold" /> Abrir mesa
          </Btn>
          <Btn
            size="sm"
            onClick={() => void adicionarMesas()}
            disabled={adicionando || quantidade >= limite}
          >
            <Plus size={15} weight="bold" />
            {adicionando ? "Adicionando…" : quantidade >= limite ? "Limite atingido" : "Adicionar mesas"}
          </Btn>
        </div>
      </div>

      <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface-raised">
        {dados.mesas.map((mesa) => {
          const tempo = mesa.abertaEm ? faixaOcupacao(mesa.abertaEm, agora, faixas) : null;
          const faixa = tempo ? FAIXAS_TEMPO[tempo.id] : null;
          const ocupada = Boolean(mesa.sessaoId);
          return (
            <div key={mesa.id} data-glass-card className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-sm border font-mono text-base font-bold",
                  ocupada
                    ? "border-brand-border bg-brand-surface text-brand-ink"
                    : "border-line bg-surface-sunken text-text-muted",
                )}
              >
                {String(mesa.numero).padStart(2, "0")}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-text">Mesa {String(mesa.numero).padStart(2, "0")}</p>
                  <Badge tone={ocupada ? "brass" : "sage"} dot>
                    {ocupada ? "Ocupada" : "Livre"}
                  </Badge>
                  <span className="rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                    {mesa.pracaNome || "Sem praça"}
                  </span>
                  {ocupada && faixa && (
                    <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold", faixa.classe)}>
                      {formatarDuracao(tempo?.minutos)} · {faixa.rotulo}
                    </span>
                  )}
                  {ocupada && <span className="font-mono text-xs font-bold text-text">{BRL(mesa.saldo)}</span>}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
                  {ocupada ? (
                    <>
                      <span>Garçom: {mesa.garcomResponsavelNome || "a definir"}</span>
                      <span className="text-text-subtle">·</span>
                      <span>
                        {mesa.pedidosAtivos} {mesa.pedidosAtivos === 1 ? "pedido ativo" : "pedidos ativos"}
                      </span>
                      {mesa.pago > 0 && (
                        <>
                          <span className="text-text-subtle">·</span>
                          <span>já pago {BRL(mesa.pago)}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <span>Sem sessão aberta · sem consumo</span>
                  )}
                </p>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <Btn size="sm" variant="outline" onClick={() => onAbrirMesa(mesa.numero)} className="px-2.5">
                  Abrir
                </Btn>
                <button
                  type="button"
                  title={copiado === mesa.id ? "Link copiado" : "Copiar link da mesa"}
                  aria-label={`Copiar link da mesa ${mesa.numero}`}
                  onClick={() => void copiarLink(mesa)}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:border-line-strong hover:text-text"
                >
                  {copiado === mesa.id ? (
                    <span className="font-mono text-[10px] font-bold text-status-success-ink">OK</span>
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
                <QrDownloadButton numero={mesa.numero} token={mesa.token} />
                {ocupada && mesa.sessaoId && (
                  <LiberarMesaBotao
                    mesa={mesa}
                    onErro={onErro}
                    onAtualizado={onAtualizado}
                  />
                )}
              </div>
            </div>
          );
        })}
        {dados.mesas.length === 0 && (
          <p className="p-6 text-center text-sm text-text-muted">Nenhuma mesa habilitada.</p>
        )}
      </div>
    </section>
  );
}

function LiberarMesaBotao({
  mesa,
  onErro,
  onAtualizado,
}: {
  mesa: MesaPanorama;
  onErro: (mensagem: string | null) => void;
  onAtualizado: () => void;
}) {
  // Mesma operação do caixa: fecha a sessão com a forma já usada pelo Admin.
  // A confirmação/erros continuam vindo do store (que já trata e avisa).
  const fecharSessao = usePub((s) => s.fecharSessao);
  const [liberando, setLiberando] = useState(false);
  return (
    <button
      type="button"
      title="Liberar mesa"
      aria-label={`Liberar mesa ${mesa.numero}`}
      disabled={liberando}
      onClick={() => {
        if (!mesa.sessaoId) return;
        setLiberando(true);
        onErro(null);
        fecharSessao(mesa.sessaoId, "dinheiro");
        // O store hidrata as mesas; recarregar o panorama logo depois mantém
        // consumo/vendas coerentes mesmo sem SSE disponível.
        setTimeout(() => {
          setLiberando(false);
          onAtualizado();
        }, 1200);
      }}
      className="min-h-10 shrink-0 rounded-sm border border-status-danger-border bg-status-danger-surface px-2.5 text-xs font-semibold text-status-danger-ink hover:bg-status-danger hover:text-status-danger-contrast disabled:opacity-60"
    >
      {liberando ? "…" : "Liberar"}
    </button>
  );
}
