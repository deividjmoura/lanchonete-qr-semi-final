import { useEffect } from "react";
import { ir } from "../router";

/**
 * STUB DE EMERGÊNCIA — o commit B2 esvaziou Admin.tsx (~21 bytes).
 * Restaurar o arquivo completo a partir de:
 *   git show b7bbe77a5cfd280e076d4c6bfe3ec0d39d4da839:src/screens/Admin.tsx
 * Depois reaplique placeholder/onError (B2) e rode npm run build + commit dist/.
 */
export default function Admin() {
  useEffect(() => {
    /* mantém rota viva sem crashar o bundle */
  }, []);

  return (
    <div className="min-h-dvh grid place-items-center p-8 text-center">
      <div className="max-w-md space-y-3">
        <p className="font-display text-3xl text-navy-900">Admin em restauração</p>
        <p className="text-sm text-slate-600 leading-relaxed">
          O arquivo <code className="font-mono text-xs">src/screens/Admin.tsx</code> foi
          corrompido por um commit. Restaure do commit{" "}
          <code className="font-mono text-xs">b7bbe77</code> (instruções no COORDENACAO.md).
        </p>
        <button
          type="button"
          className="rounded-2xl bg-brand-500 text-white px-5 py-2.5 text-sm font-bold"
          onClick={() => ir("/")}
        >
          Voltar ao início
        </button>
      </div>
    </div>
  );
}
