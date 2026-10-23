import type { CanvasElement } from "@/lib/types";

/**
 * Копии объектов для вставки и дублирования: новые id, сдвиг, копии групп.
 * Связь между скопированными объектами переводится на копии; связь с объектом вне набора
 * становится свободной линией с сохранёнными координатами концов.
 */
export function cloneElements(src: CanvasElement[], dx: number, dy: number, zFrom: number, canvasId?: string): CanvasElement[] {
  const ids = new Map(src.map((e) => [e.id, crypto.randomUUID()]));
  const sorted = [...src].sort((a, b) => a.zIndex - b.zIndex);
  return sorted.map((e, i) => {
    const content = { ...e.content };
    for (const k of ["fromId", "toId"] as const) {
      if (typeof content[k] === "string") content[k] = ids.get(content[k] as string) ?? null;
    }
    for (const k of ["from", "to"] as const) {
      const p = content[k] as { x: number; y: number } | undefined;
      if (p) content[k] = { x: p.x + dx, y: p.y + dy };
    }
    // группа — объект типа group: копия попадает в копию группы, если та тоже копируется
    const groupId = e.groupId ? ids.get(e.groupId) ?? null : null;
    return {
      ...e, id: ids.get(e.id)!, canvasId: canvasId ?? e.canvasId, x: e.x + dx, y: e.y + dy,
      zIndex: zFrom + i, content, groupId, createdBy: null, updatedAt: new Date().toISOString(),
    };
  });
}
