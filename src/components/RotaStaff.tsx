import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ir } from "../router";
import { usePub } from "../store/usePub";
import type { Role } from "../lib/types";
import { destinoDoPapel } from "./AuthFlow";

/**
 * Fronteira das telas de staff. O cookie HttpOnly é a credencial; pub-auth é
 * apenas o estado de apresentação. Um redirect externo (Google) inicia uma
 * página sem esse estado, então nenhum guard pode decidir logout antes de
 * /api/me confirmar a sessão persistida pelo callback.
 */
export function RotaStaff({ recurso, children }: {
  recurso: Role;
  children: ReactNode;
}) {
  const auth = usePub((s) => s.auth);
  const hydrateMe = usePub((s) => s.hydrateMe);
  const [estado, setEstado] = useState<"verificando" | "pronto" | "indisponivel">("verificando");

  const verificar = useCallback(async () => {
    setEstado("verificando");
    const resultado = await hydrateMe();
    setEstado(resultado === "indisponivel" ? "indisponivel" : "pronto");
  }, [hydrateMe]);

  useEffect(() => {
    void verificar();
  }, [verificar]);

  useEffect(() => {
    if (estado !== "pronto") return;
    if (!auth) {
      ir("/login");
      return;
    }
    // Mesma matriz de leitura do backend: admin acessa todos os setores.
    if (auth.role !== "admin" && auth.role !== recurso) ir(destinoDoPapel(auth.role));
  }, [estado, auth, recurso]);

  if (estado === "indisponivel") {
    return (
      <main className="min-h-dvh grid place-items-center bg-surface p-6 text-text" aria-busy="false">
        <div role="alert" className="max-w-md space-y-4 text-center">
          <h1 className="font-display text-2xl font-bold">Não foi possível confirmar sua sessão</h1>
          <p className="text-sm text-text-muted">A conexão falhou. Tente novamente antes de continuar; você não foi desconectado por este erro.</p>
          <button
            type="button"
            onClick={() => void verificar()}
            className="min-h-11 rounded-md bg-brand px-5 font-semibold text-brand-contrast"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  // Não monta a tela (nem seus fetches/pollings) durante a verificação ou um
  // redirect de perfil. Assim /api/mesas não é chamado por um caixa recém-login.
  if (estado !== "pronto" || !auth || (auth.role !== "admin" && auth.role !== recurso)) {
    return <main className="min-h-dvh grid place-items-center bg-surface p-6 text-sm text-text-muted" role="status" aria-busy="true">Verificando sessão…</main>;
  }

  return children;
}
