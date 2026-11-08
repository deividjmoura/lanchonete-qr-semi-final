import { useEffect } from "react";
import { CookingPot } from "@phosphor-icons/react";
import { OpsShell, useAnuncios } from "../components/OpsShell";
import { FilaProducao } from "../components/FilaProducao";
import { usePub } from "../store/usePub";
import { connectEvents } from "../lib/api";
import { imprimirComandaCozinha } from "../lib/print";
import { useAgora } from "../router";

export default function Cozinha() {
  useAnuncios("cozinha");
  useAgora(1000);

  const pedidos = usePub((s) => s.pedidos);
  const hydrateCozinha = usePub((s) => s.hydrateCozinha);

  useEffect(() => {
    void hydrateCozinha();
    const t = setInterval(() => void hydrateCozinha(), 8000);
    const off = connectEvents(() => void hydrateCozinha());
    return () => {
      clearInterval(t);
      off();
    };
  }, [hydrateCozinha]);

  return (
    <OpsShell
      ativo="cozinha"
      regime="operational"
      kicker="Operação · Cozinha"
      titulo="Fila da chapa"
      extra={
        <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
          <CookingPot size={13} aria-hidden="true" /> por item
        </span>
      }
    >
      <FilaProducao
        setor="cozinha"
        pedidos={pedidos}
        imprimir={imprimirComandaCozinha}
        IconeProducao={CookingPot}
        descricoes={{
          em_producao: "Na chapa agora",
          na_fila: "Aguardando ir para a chapa",
        }}
      />
    </OpsShell>
  );
}
