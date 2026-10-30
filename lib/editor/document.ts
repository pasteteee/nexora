import type { CanvasElement } from "@/lib/types";

const order = (el: CanvasElement) => typeof el.content.documentOrder === "number" && Number.isFinite(el.content.documentOrder) ? el.content.documentOrder : null;
/** Explicit flow order first; old canvas blocks migrate visually top-to-bottom. New AI blocks append. */
export function documentBlocks(els: Record<string, CanvasElement>): CanvasElement[] {
  return Object.values(els).filter((el) => el.type !== "group").sort((a, b) => {
    const ao = order(a), bo = order(b);
    if (ao !== null || bo !== null) return ao === null ? 1 : bo === null ? -1 : ao - bo || a.id.localeCompare(b.id);
    return a.y - b.y || a.x - b.x || a.zIndex - b.zIndex || a.id.localeCompare(b.id);
  });
}
export function orderPatches(blocks: CanvasElement[]): Record<string, Partial<CanvasElement>> {
  return Object.fromEntries(blocks.map((el, i) => [el.id, { content: { ...el.content, documentOrder: i } }]));
}
export function moveBlock(blocks: CanvasElement[], id: string, target: number): CanvasElement[] {
  const from = blocks.findIndex((el) => el.id === id);
  if (from < 0) return blocks;
  const next = [...blocks];
  next.splice(Math.max(0, Math.min(next.length - 1, target)), 0, next.splice(from, 1)[0]);
  return next;
}
export function splitText(text: string, start: number, end = start): [string, string] {
  const a = Math.max(0, Math.min(text.length, start));
  const b = Math.max(a, Math.min(text.length, end));
  return [text.slice(0, a), text.slice(b)];
}
export function mergeText(before: string, after: string): { text: string; caret: number } {
  return { text: before + after, caret: before.length };
}
export const isTextBlock = (el: CanvasElement) => ["text", "note", "shape", "diagram_node"].includes(el.type);
