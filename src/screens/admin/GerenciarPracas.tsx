import { Check, MapPin, Plus, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Btn, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import type { Praca } from "../../lib/panorama";

/**
 * Editor das praças internas (Praia, Guarda-sol, Salão...).
 *
 * Os nomes são linhas no banco: criar ou renomear aqui muda o panorama, o mapa
 * e o modal da mesa sem alterar código nem reiniciar o servidor. Não existe
 * exclusão: uma praça usada no histórico continua legível; para "desativar"
 * basta devolver as mesas para "Sem praça".
 */
export function GerenciarPracas({
  aberto,
  pracas,
  onClose,
  onAtualizado,
}: {
  aberto: boolean;
  pracas: Praca[];
  onClose: () => void;
  onAtualizado: () => void | Promise<void>;
}) {
  const [nomes, setNomes] = useState<Record<number, string>>({});
  const [nova, setNova] = useState("");
  const [salvando, setSalvando] = useState<number | "nova" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  // Só recarrega os campos ao abrir: o panorama atualiza a cada 30 s (SSE e
  // polling) e não pode apagar o que o operador está digitando.
  const pracasDoMomento = useRef(pracas);
  pracasDoMomento.current = pracas;
  useEffect(() => {
    if (!aberto) return;
    setNomes(Object.fromEntries(pracasDoMomento.current.map((p) => [p.id, p.nome])));
    setNova("");
    setErro(null);
    setSucesso(null);
  }, [aberto]);

  const renomear = async (praca: Praca) => {
    const nome = (nomes[praca.id] ?? "").trim();
    if (!nome || nome === praca.nome) return;
    setSalvando(praca.id);
    setErro(null);
    setSucesso(null);
    try {
      await api.adminAtualizarPraca(praca.id, { nome });
      setSucesso(`Praça renomeada para “${nome}”.`);
      await onAtualizado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao renomear a praça");
    } finally {
      setSalvando(null);
    }
  };

  const criar = async () => {
    const nome = nova.trim();
    if (!nome) return;
    setSalvando("nova");
    setErro(null);
    setSucesso(null);
    try {
      await api.adminCriarPraca(nome);
      setNova("");
      setSucesso(`Praça “${nome}” criada.`);
      await onAtualizado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao criar a praça");
    } finally {
      setSalvando(null);
    }
  };

  return (
    <Modal open={aberto} onClose={onClose}>
      <div className="p-5 pr-16 sm:p-6 sm:pr-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Classificação interna</p>
        <h3 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-text">
          <MapPin size={20} weight="fill" className="text-brand-ink" /> Praças
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          Nomes usados nos filtros, no mapa e no detalhe da mesa. Ficam no banco: renomear aqui vale para todos os
          painéis, sem deploy.
        </p>

        {erro && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-1.5 rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs text-status-danger-ink"
          >
            <WarningCircle size={15} weight="fill" className="mt-0.5 shrink-0" /> {erro}
          </p>
        )}
        {sucesso && (
          <p
            role="status"
            className="mt-3 rounded-sm border border-status-success-border bg-status-success-surface px-3 py-2 text-xs text-status-success-ink"
          >
            {sucesso}
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {pracas.length === 0 && (
            <li className="rounded-sm border border-dashed border-line-strong bg-surface-sunken p-4 text-center text-xs text-text-muted">
              Nenhuma praça cadastrada. As mesas aparecem em “Sem praça”.
            </li>
          )}
          {pracas.map((praca) => {
            const valor = nomes[praca.id] ?? praca.nome;
            const alterado = valor.trim() && valor.trim() !== praca.nome;
            return (
              <li key={praca.id} className="flex flex-wrap items-end gap-2 rounded-sm border border-line bg-surface-sunken p-2.5">
                <label className="min-w-0 flex-1 text-[11px] text-text-muted">
                  Nome da praça
                  <input
                    value={valor}
                    maxLength={40}
                    onChange={(e) => setNomes((atual) => ({ ...atual, [praca.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void renomear(praca);
                    }}
                    className="mt-1 h-10 w-full rounded-sm border border-line-strong bg-surface-raised px-2.5 text-sm text-text"
                  />
                </label>
                <span className="pb-2 font-mono text-[10px] uppercase tracking-wider text-text-subtle">
                  {praca.mesas} {praca.mesas === 1 ? "mesa" : "mesas"}
                </span>
                <Btn
                  size="sm"
                  variant="outline"
                  disabled={!alterado || salvando === praca.id}
                  onClick={() => void renomear(praca)}
                >
                  <Check size={15} weight="bold" /> {salvando === praca.id ? "Salvando…" : "Salvar"}
                </Btn>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 rounded-sm border border-line bg-surface-sunken p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Nova praça</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-[11px] text-text-muted">
              Nome
              <input
                value={nova}
                maxLength={40}
                placeholder="Ex.: Varanda"
                onChange={(e) => setNova(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void criar();
                }}
                className="mt-1 h-10 w-full rounded-sm border border-line-strong bg-surface-raised px-2.5 text-sm text-text"
              />
            </label>
            <Btn size="sm" onClick={() => void criar()} disabled={!nova.trim() || salvando === "nova"}>
              <Plus size={15} weight="bold" /> {salvando === "nova" ? "Criando…" : "Criar praça"}
            </Btn>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-text-subtle">
          Mesa sem praça aparece em “Sem praça” — nunca como uma praça fictícia. Remover uma praça não é oferecido:
          ela pode estar citada no histórico de contas.
        </p>
      </div>
    </Modal>
  );
}
