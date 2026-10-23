import type { CanvasElement } from "@/lib/types";
import type { Pt, Rect } from "./geometry";

/** Соединитель: привязка к двум объектам (fromId/toId) или свободные концы (from/to), ТЗ 4.2.5 */
export type ConnectorContent = { fromId?: string | null; toId?: string | null; from?: Pt; to?: Pt };

const center = (r: Rect): Pt => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Точка на границе прямоугольника по лучу из его центра к цели */
export function edgePoint(r: Rect, toward: Pt): Pt {
  const c = center(r);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const sx = dx ? r.width / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? r.height / 2 / Math.abs(dy) : Infinity;
  const k = Math.min(sx, sy);
  return { x: c.x + dx * k, y: c.y + dy * k };
}

/** Концы линии; привязанный конец лежит на границе объекта. null — объект удалён. */
export function endpoints(el: CanvasElement, els: Record<string, CanvasElement>): { a: Pt; b: Pt } | null {
  const c = el.content as ConnectorContent;
  const A = c.fromId ? els[c.fromId] : null;
  const B = c.toId ? els[c.toId] : null;
  if ((c.fromId && !A) || (c.toId && !B)) return null;
  const pa = A ? center(A) : c.from ?? { x: el.x, y: el.y };
  const pb = B ? center(B) : c.to ?? { x: el.x + el.width, y: el.y + el.height };
  return { a: A ? edgePoint(A, pb) : pa, b: B ? edgePoint(B, pa) : pb };
}

export const isBound = (el: CanvasElement) => {
  const c = el.content as ConnectorContent;
  return !!(c.fromId || c.toId);
};

/** Габариты для выделения и проверки границ мира */
export function rectOf(el: CanvasElement, els: Record<string, CanvasElement>): Rect {
  if (el.type !== "connector") return el;
  const p = endpoints(el, els);
  if (!p) return el;
  return {
    x: Math.min(p.a.x, p.b.x), y: Math.min(p.a.y, p.b.y),
    width: Math.max(1, Math.abs(p.a.x - p.b.x)), height: Math.max(1, Math.abs(p.a.y - p.b.y)),
  };
}

/** Сдвиг объекта; у соединителя сдвигаются только свободные концы */
export function translate(el: CanvasElement, dx: number, dy: number): Partial<CanvasElement> {
  if (el.type !== "connector") return { x: el.x + dx, y: el.y + dy };
  const c = el.content as ConnectorContent;
  const move = (p?: Pt) => (p ? { x: p.x + dx, y: p.y + dy } : p);
  return {
    x: el.x + dx, y: el.y + dy,
    content: { ...c, from: c.fromId ? c.from : move(c.from), to: c.toId ? c.to : move(c.to) },
  };
}

/** Наконечник стрелки в точке tip, направленный от from */
export function arrowHead(from: Pt, tip: Pt, size = 12): string {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const p = (a: number) => `${tip.x - size * Math.cos(ang + a)},${tip.y - size * Math.sin(ang + a)}`;
  return `${tip.x},${tip.y} ${p(0.45)} ${p(-0.45)}`;
}
