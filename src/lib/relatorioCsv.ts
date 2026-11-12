/**
 * Exportação CSV do relatório administrativo (#299).
 * Gera todas as contas do período sem truncagem, com escape RFC-4180.
 */

export type ContaRelatorioExport = {
  id: number | string;
  mesa: number | string;
  cliente?: string | null;
  garcomResponsavel?: string | null;
  valor?: number | string | null;
  desconto?: number | string | null;
  taxaServico?: number | string | null;
  valorCobrado?: number | string | null;
  forma?: string | null;
  fechadaEm?: string | Date | null;
};

export const CABECALHO_CSV_RELATORIO =
  "id,mesa,cliente,garcomResponsavel,valor,desconto,taxaServico,valorCobrado,forma,fechadaEm";

function celulaCsv(valor: unknown): string {
  const texto =
    valor instanceof Date
      ? valor.toISOString()
      : String(valor ?? "");
  return `"${texto.replace(/"/g, '""')}"`;
}

export function gerarCsvRelatorio(contas: ContaRelatorioExport[]): string {
  const body = contas
    .map((c) =>
      [
        c.id,
        c.mesa,
        c.cliente ?? "",
        c.garcomResponsavel ?? "",
        c.valor,
        c.desconto,
        c.taxaServico,
        c.valorCobrado,
        c.forma,
        c.fechadaEm,
      ]
        .map(celulaCsv)
        .join(","),
    )
    .join("\n");
  return body ? `${CABECALHO_CSV_RELATORIO}\n${body}` : CABECALHO_CSV_RELATORIO;
}
