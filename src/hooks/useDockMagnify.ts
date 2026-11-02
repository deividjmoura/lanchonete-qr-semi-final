import { useCallback, useEffect, useRef, useState } from "react";

/** Escala estilo dock: item sob o cursor cresce; vizinhos reagem. */
function escalaDock(distanciaPx: number, maxDist = 88): number {
  if (distanciaPx >= maxDist) return 1;
  const t = 1 - distanciaPx / maxDist;
  return 1 + 0.35 * t * t;
}

/**
 * Magnificação tipo macOS dock para uma lista vertical de itens.
 * Retorna refs + scales + handlers de mouse.
 */
export function useDockMagnify(itemCount: number, reduceMotion: boolean | null, axis: "x" | "y" = "y") {
  const navListRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [scales, setScales] = useState<number[]>(() => Array.from({ length: itemCount }, () => 1));

  useEffect(() => {
    setScales(Array.from({ length: itemCount }, () => 1));
    itemRefs.current = itemRefs.current.slice(0, itemCount);
  }, [itemCount]);

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (reduceMotion || !navListRef.current) return;
      const pointer = axis === "x" ? event.clientX : event.clientY;
      const next = itemRefs.current.map((el) => {
        if (!el) return 1;
        const rect = el.getBoundingClientRect();
        const centro = axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
        return escalaDock(Math.abs(pointer - centro));
      });
      setScales(next);
    },
    [reduceMotion, axis],
  );

  const onMouseLeave = useCallback(() => {
    setScales(Array.from({ length: itemCount }, () => 1));
  }, [itemCount]);

  const setItemRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    },
    [],
  );

  const itemStyle = useCallback(
    (index: number) => {
      const scale = scales[index] ?? 1;
      return {
        transform: `scale(${scale})`,
        transformOrigin: axis === "x" ? "center bottom" as const : "left center" as const,
        transition: reduceMotion ? "none" : "transform 120ms cubic-bezier(0.2, 0, 0, 1)",
        zIndex: scale > 1.05 ? 2 : 1,
      };
    },
    [scales, reduceMotion],
  );

  return { navListRef, setItemRef, itemStyle, onMouseMove, onMouseLeave, scales };
}
