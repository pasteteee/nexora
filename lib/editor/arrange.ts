/** Порядок наложения, выравнивание и группировка (ТЗ 4.2.5) — чистые функции над объектами */
import type { CanvasElement } from "@/lib/types";
import { bbox } from "./geometry";

type Els = Record<string, CanvasElement>;
type Patches = Record<string, Partial<CanvasElement>>;

export type ZMove = "front" | "back" | "forward" | "backward";

/** Новые z_index для выбранных объектов; порядок внутри выделения сохраняется */
export function zOrder(els: Els, ids: string[], move: ZMove): Patches {
  const sel = new Set(ids);
  const all = Object.values(els).sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  let order = all.map((e) => e.id);
  if (move === "front") order = [...order.filter((id) => !sel.has(id)), ...order.filter((id) => sel.has(id))];
  else if (move === "back") order = [...order.filter((id) => sel.has(id)), ...order.filter((id) => !sel.has(id))];
  else {
    const step = move === "forward" ? 1 : -1;
    const idx = order.map((_, i) => i);
    const seq = step > 0 ? [...idx].reverse() : idx;
    for (const i of seq) {
      const j = i + step;
      if (sel.has(order[i]) && j >= 0 && j < order.length && !sel.has(order[j])) [order[i], order[j]] = [order[j], order[i]];
    }
  }
  const out: Patches = {};
  order.forEach((id, i) => { if (els[id].zIndex !== i + 1) out[id] = { zIndex: i + 1 }; });
  return out;
}

export type Align = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

export function alignPatches(items: CanvasElement[], how: Align): Patches {
  const box = bbox(items);
  if (!box || items.length < 2) return {};
  const out: Patches = {};
  for (const e of items) {
    const x = how === "left" ? box.x : how === "right" ? box.x + box.width - e.width
      : how === "hcenter" ? box.x + (box.width - e.width) / 2 : e.x;
    const y = how === "top" ? box.y : how === "bottom" ? box.y + box.height - e.height
      : how === "vcenter" ? box.y + (box.height - e.height) / 2 : e.y;
    if (x !== e.x || y !== e.y) out[e.id] = { x: Math.round(x), y: Math.round(y) };
  }
  return out;
}

/** Равные промежутки между объектами по оси */
export function distributePatches(items: CanvasElement[], axis: "x" | "y"): Patches {
  if (items.length < 3) return {};
  const size = axis === "x" ? "width" : "height";
  const sorted = [...items].sort((a, b) => a[axis] - b[axis]);
  const first = sorted[0], last = sorted.at(-1)!;
  const span = last[axis] + last[size] - first[axis];
  const gap = (span - sorted.reduce((s, e) => s + e[size], 0)) / (sorted.length - 1);
  const out: Patches = {};
  let pos = first[axis];
  for (const e of sorted) {
    if (Math.round(pos) !== e[axis]) out[e.id] = { [axis]: Math.round(pos) };
    pos += e[size] + gap;
  }
  return out;
}

/** Группа — служебный объект 'group' на том же холсте; участники ссылаются на неё через group_id */
export function makeGroup(items: CanvasElement[], canvasId: string): { group: CanvasElement; patch: Patches } | null {
  const members = items.filter((e) => e.type !== "group");
  if (members.length < 2) return null;
  const box = bbox(members)!;
  const group: CanvasElement = {
    id: crypto.randomUUID(), canvasId, type: "group", ...box, rotation: 0,
    zIndex: Math.min(...members.map((e) => e.zIndex)), content: {}, style: {},
    sourceId: null, groupId: null, createdBy: null, updatedAt: new Date().toISOString(),
  };
  // вложенные группы не поддерживаются: старая группа участников расформировывается
  const patch: Patches = Object.fromEntries(members.map((e) => [e.id, { groupId: group.id }]));
  return { group, patch };
}

export function ungroup(els: Els, groupIds: string[]): { patch: Patches; remove: string[] } {
  const gs = new Set(groupIds);
  const patch: Patches = {};
  for (const e of Object.values(els)) if (e.groupId && gs.has(e.groupId)) patch[e.id] = { groupId: null };
  return { patch, remove: [...gs].filter((id) => els[id]?.type === "group") };
}

/** Группы, которые останутся без участников или с одним участником */
export function orphanGroups(els: Els, groupIds: Iterable<string>): string[] {
  return [...new Set(groupIds)].filter((g) => Object.values(els).filter((e) => e.groupId === g).length < 2);
}
