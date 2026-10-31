import { useEffect } from "react";
import { BeerStein } from "@phosphor-icons/react";
import { OpsShell, useAnuncios } from "../components/OpsShell";
import { FilaProducao } from "../components/FilaProducao";
import { usePub } from "../store/usePub";
import { connectEvents } from "../lib/api";
import { imprimirComandaBar } from "../lib/print";
import { ir, useAgora } from "../router";

export default function Bar() {
  const auth = usePub((s) => s.auth);
  useEffect(() => {
    if (!auth) {
      ir("/login");
      return;
    }
    if (auth.role !== "admin" && auth.role !== "bar") {
      ir(auth.role === "cozinha" ? "/cozinha" : auth.role === "caixa" ? "/caixa" : "/login");
    }
  }, [auth]);

  useAnuncios("bar");
  useAgora(1000);

  const pedidos = usePub((s) => s.pedidos);
  const hydrateBar = usePub((s) => s.hydrateBar);

  useEffect(() => {
    void hydrateBar();
    const t = setInterval(() => void hydrateBar(), 8000);
    const off = connectEvents(() => void hydrateBar());
    return () => {
      clearInterval(t);
      off();
    };
  }, [hydrateBar]);

  return (
    <OpsShell
      ativo="bar"
      regime="operational"
      kicker="Operação · Bar"
      titulo="Fila do balcão"
      extra={
        <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
          <BeerStein size={13} aria-hidden="true" /> por item
        </span>
      }
    >
      <FilaProducao
        setor="bar"
        pedidos={pedidos}
        imprimir={imprimirComandaBar}
        IconeProducao={BeerStein}
        descricoes={{
          em_producao: "No balcão agora",
          na_fila: "Aguardando preparo no balcão",
        }}
      />
    </OpsShell>
  );
}
