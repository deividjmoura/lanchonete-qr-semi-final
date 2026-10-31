import { ArrowsClockwise, MapPin, MapTrifold, SquaresFour, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Btn } from "../../components/ui";
import { api, connectEvents } from "../../lib/api";
import type {
  FiltroPraca,
  PanoramaMesas as PanoramaResposta,
  PeriodoPanorama,
} from "../../lib/panorama";
import { useAgora } from "../../router";
import { usePub } from "../../store/usePub";
import { GerenciarPracas } from "./GerenciarPracas";
import { MapaQrMesas } from "./MapaQrMesas";
import { MesaDetalheModal } from "./MesaDetalheModal";
import { PanoramaMesas } from "./PanoramaMesas";

type Garcom = { id: number; nome: string };
type Visao = "panorama" | "mapa";

/**
 * Aba Mesas do admin: panorama operacional (uma entrada por mesa, inclusive
 * livres) e mapa/QR Codes. As duas visões usam o mesmo modal de operações,
 * preservando QR, links, ativação, transferência de garçom e liberação.
 */
export default function MesasAdmin() {
  const hydrateMesas = usePub((s) => s.hydrateMesas);
  const [visao, setVisao] = useState<Visao>("panorama");
  const [periodo, setPeriodo] = useState<PeriodoPanorama>("hoje");
  const [filtro, setFiltro] = useState<FiltroPraca>("todas");
  const [dados, setDados] = useState<PanoramaResposta | null>(null);
  const [garcons, setGarcons] = useState<Garcom[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mesaAberta, setMesaAberta] = useState<number | null>(null);
  const [pracasAberto, setPracasAberto] = useState(false);
  const agora = useAgora(15000);

  const carregar = useCallback(async (periodoAtual: PeriodoPanorama, silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const resposta = await api.adminMesasPanorama(periodoAtual);
      setDados(resposta);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o panorama de mesas");
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(periodo);
  }, [carregar, periodo]);

  useEffect(() => {
    let vivo = true;
    api
      .listGarcons()
      .then((rows) => {
        if (!vivo) return;
        setGarcons(
          (rows || [])
            .filter((g) => g.ativo)
            .map((g) => ({ id: Number(g.id), nome: String(g.nome) })),
        );
      })
      .catch(() => {
        /* a lista de garçons só alimenta a transferência; o panorama segue útil */
      });
    return () => {
      vivo = false;
    };
  }, []);

  // SSE mantém o painel vivo; o intervalo cobre queda de conexão ou aba
  // aberta por muito tempo sem eventos.
  useEffect(() => {
    const off = connectEvents(() => void carregar(periodo, true));
    const timer = setInterval(() => void carregar(periodo, true), 30000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [carregar, periodo]);

  const atualizarTudo = useCallback(() => {
    void hydrateMesas();
    void carregar(periodo, true);
  }, [hydrateMesas, carregar, periodo]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Visões de mesas"
          className="inline-flex rounded-md border border-line bg-surface-raised p-1"
        >
          <button
            type="button"
            aria-pressed={visao === "panorama"}
            onClick={() => setVisao("panorama")}
            className={
              visao === "panorama"
                ? "inline-flex min-h-9 items-center gap-1.5 rounded-sm bg-brand-surface px-3 text-xs font-semibold text-brand-ink"
                : "inline-flex min-h-9 items-center gap-1.5 rounded-sm px-3 text-xs font-semibold text-text-muted hover:text-text"
            }
          >
            <SquaresFour size={15} weight="bold" /> Panorama
          </button>
          <button
            type="button"
            aria-pressed={visao === "mapa"}
            onClick={() => setVisao("mapa")}
            className={
              visao === "mapa"
                ? "inline-flex min-h-9 items-center gap-1.5 rounded-sm bg-brand-surface px-3 text-xs font-semibold text-brand-ink"
                : "inline-flex min-h-9 items-center gap-1.5 rounded-sm px-3 text-xs font-semibold text-text-muted hover:text-text"
            }
          >
            <MapTrifold size={15} weight="bold" /> Mapa e QR Codes
          </button>
        </div>

        <div className="flex items-center gap-2">
          {carregando && <span className="font-mono text-[10px] uppercase tracking-wider text-text-subtle">Atualizando…</span>}
          <Btn size="sm" variant="outline" onClick={() => setPracasAberto(true)}>
            <MapPin size={15} weight="bold" /> Praças
          </Btn>
          <Btn size="sm" variant="outline" onClick={() => void carregar(periodo)} disabled={carregando}>
            <ArrowsClockwise size={15} weight="bold" /> Atualizar
          </Btn>
        </div>
      </div>

      {erro && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-sm border border-status-danger-border bg-status-danger-surface px-3.5 py-2 text-xs font-semibold text-status-danger-ink"
        >
          <WarningCircle size={15} weight="fill" className="mt-0.5 shrink-0" /> {erro}
        </p>
      )}

      {!dados ? (
        <p className="rounded-md border border-line bg-surface-raised p-8 text-center text-sm text-text-muted">
          {carregando ? "Carregando panorama de mesas…" : "Panorama indisponível no momento."}
        </p>
      ) : visao === "panorama" ? (
        <PanoramaMesas
          dados={dados}
          filtro={filtro}
          onFiltro={setFiltro}
          periodo={periodo}
          onPeriodo={setPeriodo}
          onAbrirMesa={setMesaAberta}
          agora={agora}
        />
      ) : (
        <MapaQrMesas
          dados={dados}
          agora={agora}
          onAbrirMesa={setMesaAberta}
          onAtualizado={atualizarTudo}
          onErro={setErro}
        />
      )}

      <GerenciarPracas
        aberto={pracasAberto}
        pracas={dados?.pracas || []}
        onClose={() => setPracasAberto(false)}
        onAtualizado={async () => {
          await carregar(periodo, true);
          void hydrateMesas();
        }}
      />

      <MesaDetalheModal
        numero={mesaAberta}
        pracas={dados?.pracas || []}
        garcons={garcons}
        agora={agora}
        onClose={() => setMesaAberta(null)}
        onAlterado={atualizarTudo}
        onErro={setErro}
      />
    </section>
  );
}
