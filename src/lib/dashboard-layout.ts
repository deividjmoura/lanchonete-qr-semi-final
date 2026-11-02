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

const inteiro = (valor: unknown, padrao = 0) => {
  const numero = Math.round(Number(valor));
  return Number.isFinite(numero) ? numero : padrao;
};

function limitarTamanho(desejado: DashboardRect, columns: number): DashboardRect {
  const w = Math.max(1, Math.min(columns, inteiro(desejado.w, 1)));
  const h = Math.max(1, inteiro(desejado.h, 1));
  const x = Math.max(0, Math.min(columns - w, inteiro(desejado.x)));
  const y = Math.max(0, inteiro(desejado.y));
  return { x, y, w, h };
}

/** Mapa de células ocupadas: deixa a busca de espaço livre O(1) por candidato,
 * já que ela roda a cada movimento do ponteiro durante o redimensionamento. */
function mapaOcupado(widgets: DashboardRects, id: string, columns: number, linhas: number): boolean[][] {
  const mapa: boolean[][] = Array.from({ length: linhas }, () => new Array<boolean>(columns).fill(false));
  for (const [outroId, rect] of Object.entries(widgets)) {
    if (outroId === id) continue;
    for (let y = Math.max(0, rect.y); y < Math.min(linhas, rect.y + rect.h); y += 1) {
      for (let x = Math.max(0, rect.x); x < Math.min(columns, rect.x + rect.w); x += 1) mapa[y][x] = true;
    }
  }
  return mapa;
}

function livre(mapa: boolean[][], x: number, y: number, w: number, h: number): boolean {
  for (let linha = y; linha < y + h; linha += 1) {
    const faixa = mapa[linha];
    if (!faixa) return false;
    for (let coluna = x; coluna < x + w; coluna += 1) if (faixa[coluna] !== false) return false;
  }
  return true;
}

/**
 * Posição livre mais próxima do alvo pedido.
 *
 * A busca mede a distância em células até o destino (com peso maior no eixo
 * vertical) e prefere empurrar o widget para baixo, que é o sentido natural de
 * crescimento do canvas. O parâmetro `avoid` existe para o caso de arraste: sem
 * ele, a vaga que o próprio widget acabou de liberar seria a "mais próxima" e o
 * card voltaria para o lugar de origem, parecendo que o arraste não funcionou.
 */
export function findAvailablePosition(
  widgets: DashboardRects,
  id: string,
  desired: DashboardRect,
  columns = DASHBOARD_COLUMNS,
  maxRows = 300,
  avoid: DashboardRect | null = null,
): DashboardRect {
  const { x: alvoX, y: alvoY, w, h } = limitarTamanho(desired, columns);
  const fundo = Object.values(widgets).reduce((bottom, rect) => Math.max(bottom, rect.y + rect.h), 0);
  const limite = Math.max(maxRows, fundo + h + 1, alvoY + h + 1);
  const mapa = mapaOcupado(widgets, id, columns, limite + h);
  const evitarOrigem = Boolean(avoid) && (alvoX !== avoid!.x || alvoY !== avoid!.y);
  let melhor: DashboardRect | null = null;
  let melhorCusto = Number.POSITIVE_INFINITY;
  for (let y = 0; y <= limite; y += 1) {
    const dy = Math.abs(y - alvoY);
    for (let x = 0; x <= columns - w; x += 1) {
      const custo = Math.abs(x - alvoX) + dy * 1.5 + (y < alvoY ? 0.75 : 0);
      if (custo >= melhorCusto) continue;
      if (evitarOrigem && x === avoid!.x && y === avoid!.y) continue;
      if (!livre(mapa, x, y, w, h)) continue;
      melhor = { x, y, w, h };
      melhorCusto = custo;
      if (custo === 0) return melhor;
    }
  }
  return melhor ?? { x: 0, y: Math.max(alvoY, fundo) + 1, w, h };
}

/**
 * Coloca o widget exatamente no destino escolhido pelo ponteiro. Se o destino
 * estiver ocupado, os widgets atingidos são deslocados para a vaga livre mais
 * próxima — nessa ordem, da vaga deixada pelo próprio widget arrastado para
 * baixo. O destino é sempre respeitado e nenhum widget fica sobreposto.
 */
export function placeWidget<R extends DashboardRects>(
  widgets: R,
  id: string,
  desired: DashboardRect,
  columns = DASHBOARD_COLUMNS,
): R {
  const atual = widgets[id];
  const alvo = limitarTamanho({ ...desired, w: desired.w ?? atual?.w, h: desired.h ?? atual?.h }, columns);
  const resultado: DashboardRects = { ...widgets, [id]: { ...atual, ...alvo } };
  const atingidos = Object.entries(widgets)
    .filter(([outroId, rect]) => outroId !== id && rectsOverlap(alvo, rect))
    .sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
  for (const [outroId, rect] of atingidos) {
    const ocupados: DashboardRects = { ...resultado };
    delete ocupados[outroId];
    resultado[outroId] = { ...rect, ...findAvailablePosition(ocupados, outroId, rect, columns) };
  }
  return resultado as R;
}

/** Redimensiona mantendo o canto superior esquerdo e empurrando quem ocupar a
 * área nova, para que a alça funcione em qualquer posição da grade. */
export function resizeWidget<R extends DashboardRects>(
  widgets: R,
  id: string,
  size: { w: number; h: number },
  columns = DASHBOARD_COLUMNS,
): R {
  const atual = widgets[id];
  if (!atual) return widgets;
  return placeWidget(widgets, id, { x: atual.x, y: atual.y, w: size.w, h: size.h }, columns);
}
