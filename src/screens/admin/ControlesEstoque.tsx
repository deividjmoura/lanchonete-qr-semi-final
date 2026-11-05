import type { Produto } from "../../lib/types";
import { usePub } from "../../store/usePub";

export function quantidadeEstoque(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.trim().replace(",", "."));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function estoqueBaixo(p: Pick<Produto, "estoque" | "estoqueMinimo">): boolean {
  return p.estoque != null && p.estoque <= (p.estoqueMinimo ?? 0);
}

export function ControlesEstoque({ produto }: { produto: Produto }) {
  const setEstoque = usePub((s) => s.setEstoque);
  const ativar = usePub((s) => s.ativarControleEstoque);
  const reportarErro = usePub((s) => s.reportarErro);
  const q = produto.estoque ?? 0;
  const classe = "min-h-9 rounded-sm border border-line bg-surface-sunken px-2.5 text-xs font-semibold text-text hover:border-line-strong disabled:opacity-50";
  const pedir = (titulo: string, atual: number, aplicar: (n: number) => void) => {
    const raw = window.prompt(`${produto.nome}: ${titulo}`, String(atual));
    if (raw === null) return;
    const n = quantidadeEstoque(raw);
    if (n === null) {
      reportarErro("Quantidade inválida. Informe um número inteiro maior ou igual a zero.");
      return;
    }
    reportarErro(null);
    aplicar(n);
  };

  return (
    <div role="group" aria-label={`Estoque de ${produto.nome}`} className="mt-2 flex flex-wrap items-center gap-1.5">
      {produto.estoque != null ? (
        <>
          <button type="button" className={classe} aria-label={`Registrar entrada de ${produto.nome}`} onClick={() => pedir("Quantas unidades entraram?", 10, (n) => {
            if (!Number.isSafeInteger(q + n)) {
              reportarErro("Quantidade inválida: saldo acima do limite permitido.");
              return;
            }
            setEstoque(produto.id, q + n);
          })}>+ entrada</button>
          <button type="button" className={classe} aria-label={`Definir estoque de ${produto.nome}`} onClick={() => pedir("Definir estoque absoluto", q, (n) => setEstoque(produto.id, n))}>Definir</button>
          <button type="button" className={classe} disabled={q <= 0} aria-label={`Retirar uma unidade de ${produto.nome}`} onClick={() => setEstoque(produto.id, Math.max(0, q - 1))}>−1</button>
        </>
      ) : (
        <button type="button" className={classe} aria-label={`Ativar controle de estoque de ${produto.nome}`} onClick={() => pedir("Ativar estoque. Quantas unidades tem agora?", 20, (n) => ativar(produto.id, n))}>Ativar + qtd</button>
      )}
    </div>
  );
}
