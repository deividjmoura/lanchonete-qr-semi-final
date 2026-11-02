export const DASHBOARD_COLUMNS = 12;

export type DashboardRect = { x: number; y: number; w: number; h: number };
export type DashboardRects = Record<string, DashboardRect>;

export function rectsOverlap(a: DashboardRect, b: DashboardRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y;
}

export function canPlaceWidget(
  widgets: DashboardRects,
  id: string,
  candidate: DashboardRect,
  columns = DASHBOARD_COLUMNS,
): boolean {
  if (![candidate.x, candidate.y, candidate.w, candidate.h].every(Number.isInteger)) return false;
  if (candidate.x < 0 || candidate.y < 0 || candidate.w < 1 || candidate.h < 1 ||
      candidate.x + candidate.w > columns) return false;
  return Object.entries(widgets).every(([otherId, other]) =>
    otherId === id || rectsOverlap(candidate, other) === false);
}

/** Procura a posição livre mais próxima do alvo, expandindo em linhas.
 * O card nunca é colocado sobre outro, mesmo quando o destino está ocupado. */
export function findAvailablePosition(
  widgets: DashboardRects,
  id: string,
  desired: DashboardRect,
  columns = DASHBOARD_COLUMNS,
  maxRows = 300,
): DashboardRect {
  const w = Math.max(1, Math.min(columns, Math.round(desired.w)));
  const h = Math.max(1, Math.round(desired.h));
  const x = Math.max(0, Math.min(columns - w, Math.round(desired.x)));
  const y = Math.max(0, Math.round(desired.y));
  const candidates: DashboardRect[] = [];
  for (let dy = 0; dy <= maxRows; dy += 1) {
    const row = y + dy;
    const xs = Array.from({ length: columns - w + 1 }, (_, i) => i)
      .sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
    for (const col of xs) candidates.push({ x: col, y: row, w, h });
    if (dy > 0) {
      const prior = y - dy;
      if (prior >= 0) for (const col of xs) candidates.push({ x: col, y: prior, w, h });
    }
    for (const candidate of candidates.splice(0)) {
      if (canPlaceWidget(widgets, id, candidate, columns)) return candidate;
    }
  }
  return { x: 0, y: y + maxRows + 1, w, h };
}
