import { Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { mesaClienteUrl } from "../../lib/mesaUrl";
import type { MesaPanorama, PanoramaMesas as PanoramaResposta } from "../../lib/panorama";
import { usePub } from "../../store/usePub";
import { CartaoMesa } from "./PanoramaMesas";
import { QrDownloadButton } from "./QrDownloadButton";

type Props = {
  dados: PanoramaResposta;
  agora: number;
  onAbrirMesa: (numero: number) => void;
  onAtualizado: () => void;
  onErro: (mensagem: string | null) => void;
};

export function MapaQrMesas({ dados, agora, onAbrirMesa, onAtualizado, onErro }: Props) {
  const [numero, setNumero] = useState("");
  const [copiado, setCopiado] = useState<number | null>(null);

  const termosBusca = numero.split(",").map((termo) => termo.trim()).filter(Boolean);
  const numerosBusca = [...new Set(termosBusca.map(Number))];
  const buscaInvalida = termosBusca.some(
    (termo) => !/^\d+$/.test(termo) || !Number.isSafeInteger(Number(termo)) || Number(termo) < 1,
  );
  const mesasFiltradas = buscaInvalida
    ? []
    : dados.mesas.filter((mesa) => numerosBusca.includes(mesa.numero));
  const mesasNaoEncontradas = buscaInvalida
    ? []
    : numerosBusca.filter((n) => !dados.mesas.some((mesa) => mesa.numero === n));

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
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-md border border-line bg-surface-raised p-4 sm:p-5">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-bold tracking-tight text-text">Mapa de mesas e QR Codes</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Pesquise para visualizar as mesas desejadas. Toque no cartão para abrir os detalhes da mesa.
          </p>
        </div>
        <label className="block w-full sm:w-auto font-mono text-[11px] uppercase tracking-wider text-text-muted">
          Pesquisar nº da mesa
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={numero}
            placeholder="Ex.: 1, 5, 12"
            title="Pesquise uma ou mais mesas. Separe os números por vírgula (ex.: 1, 5, 12)."
            aria-label="Pesquisar uma ou mais mesas por número, separadas por vírgula"
            aria-describedby="mapa-mesas-ajuda"
            onChange={(e) => setNumero(e.target.value)}
            className="mt-1 block h-12 w-full rounded-sm border border-line-strong bg-surface-sunken px-4 font-mono text-base text-text sm:w-72"
          />
          <span id="mapa-mesas-ajuda" className="sr-only">
            Digite um número ou vários números separados por vírgula, por exemplo 1, 5, 12.
          </span>
        </label>
      </div>

      {!numero.trim() ? (
        <p className="rounded-md border border-line bg-surface-raised p-6 text-center text-sm text-text-muted">
          Digite o número de uma ou mais mesas para exibi-las.
        </p>
      ) : buscaInvalida ? (
        <p className="rounded-md border border-status-danger-border bg-status-danger-surface p-6 text-center text-sm text-status-danger-ink">
          Use apenas números positivos separados por vírgula. Ex.: 1, 5, 12.
        </p>
      ) : mesasFiltradas.length === 0 ? (
        <p className="rounded-md border border-line bg-surface-raised p-6 text-center text-sm text-text-muted">
          Nenhuma mesa encontrada para essa pesquisa.
        </p>
      ) : (
        <>
          <p className="font-mono text-[11px] uppercase tracking-wider text-text-subtle">
            {mesasFiltradas.length}{" "}
            {mesasFiltradas.length === 1 ? "mesa encontrada" : "mesas encontradas"} · {dados.mesas.length} habilitadas
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {mesasFiltradas.map((mesa) => (
              <CartaoMesa
                key={mesa.id}
                mesa={mesa}
                faixas={dados.config.faixas}
                agora={agora}
                onAbrir={() => onAbrirMesa(mesa.numero)}
                acoes={
                  <>
                    <button
                      type="button"
                      title={copiado === mesa.id ? "Link copiado" : "Copiar link da mesa"}
                      aria-label={`Copiar link da mesa ${mesa.numero}`}
                      onClick={() => void copiarLink(mesa)}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-sm border border-line bg-surface-sunken px-2.5 text-[11px] font-semibold text-text-muted hover:border-line-strong hover:text-text"
                    >
                      {copiado === mesa.id ? (
                        <span className="font-mono font-bold text-status-success-ink">Link copiado</span>
                      ) : (
                        <>
                          <Copy size={14} /> Link
                        </>
                      )}
                    </button>
                    <QrDownloadButton numero={mesa.numero} token={mesa.token} className="size-9 shrink-0" />
                    {mesa.sessaoId && (
                      <LiberarMesaBotao mesa={mesa} onErro={onErro} onAtualizado={onAtualizado} />
                    )}
                  </>
                }
              />
            ))}
          </div>
          {mesasNaoEncontradas.length > 0 && (
            <p className="rounded-sm border border-line bg-surface-raised p-3 text-center text-xs text-text-muted">
              Não encontrada(s): {mesasNaoEncontradas.join(", ")}
            </p>
          )}
        </>
      )}
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
  const liberar = () => {
    if (!mesa.sessaoId || liberando) return;
    setLiberando(true);
    onErro(null);
    fecharSessao(mesa.sessaoId, "dinheiro");
    // O store hidrata as mesas; recarregar o panorama logo depois mantém
    // consumo/vendas coerentes mesmo sem SSE disponível.
    setTimeout(() => {
      setLiberando(false);
      onAtualizado();
    }, 1200);
  };
  return (
    <button
      type="button"
      title="Liberar mesa"
      aria-label={`Liberar mesa ${mesa.numero}`}
      disabled={liberando}
      onClick={liberar}
      className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-sm border border-status-danger-border bg-status-danger-surface px-2.5 text-[11px] font-semibold text-status-danger-ink hover:bg-status-danger hover:text-status-danger-contrast disabled:opacity-60"
    >
      {liberando ? "…" : "Liberar"}
    </button>
  );
}
