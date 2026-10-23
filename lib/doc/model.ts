/**
 * Модель страницы-документа. Страница — это список блоков сверху вниз (как в Notion),
 * блоки можно ставить рядом — в колонки. Хранится в той же таблице elements, что и раньше:
 *   y        — порядок блока (дробный, чтобы вставка не сдвигала соседей),
 *   x        — номер колонки внутри ряда,
 *   width    — относительная ширина колонки,
 *   content  — { kind, text, checked, indent, row }, style — { tint }.
 * Схема БД не меняется.
 */
import type { CanvasElement } from "@/lib/types";

export const KINDS = [
  "p", "h1", "h2", "h3", "bullet", "numbered", "todo", "quote", "callout", "code", "formula", "divider",
] as const;
export type BlockKind = (typeof KINDS)[number];
export const TINTS = ["yellow", "green", "blue", "pink", "gray"] as const;
export type Tint = (typeof TINTS)[number];

/** Блоки, где текст — простой (без разметки): код и TeX */
export const PLAIN: ReadonlySet<BlockKind> = new Set(["code", "formula"]);
/** Блоки без текста */
export const VOID: ReadonlySet<BlockKind> = new Set(["divider"]);
/** Блоки-списки: Enter продолжает тот же тип */
export const LISTS: ReadonlySet<BlockKind> = new Set(["bullet", "numbered", "todo"]);
export const MAX_INDENT = 4;
export const MAX_COLUMNS = 4;

export interface Block {
  id: string;
  pageId: string;
  kind: BlockKind;
  /** HTML с простой разметкой (b, i, u, s, code, a) или чистый текст для PLAIN */
  text: string;
  checked: boolean;
  indent: number;
  tint: Tint | null;
  order: number;
  row: string | null;
  col: number;
  colW: number;
  createdBy: string | null;
}

export type Column = { w: number; ids: string[] };
export type Item = { type: "block"; id: string } | { type: "row"; id: string; cols: Column[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function fromElement(e: CanvasElement): Block {
  const c = e.content as Record<string, unknown>;
  const kind = (KINDS as readonly string[]).includes(c.kind as string) ? (c.kind as BlockKind) : "p";
  // объекты со старого холста (заметки) становятся абзацами
  const text = typeof c.text === "string" ? (c.kind ? c.text : esc(c.text)) : "";
  const tint = (e.style as Record<string, unknown>).tint;
  return {
    id: e.id,
    pageId: e.canvasId,
    kind,
    text,
    checked: c.checked === true,
    indent: Math.max(0, Math.min(MAX_INDENT, Number(c.indent) || 0)),
    tint: (TINTS as readonly string[]).includes(tint as string) ? (tint as Tint) : null,
    order: e.y,
    row: typeof c.row === "string" ? c.row : null,
    col: typeof c.row === "string" ? Math.max(0, Math.round(e.x)) : 0,
    colW: e.width > 0 ? e.width : 1,
    createdBy: e.createdBy,
  };
}

export function toElement(b: Block): CanvasElement {
  return {
    id: b.id,
    canvasId: b.pageId,
    type: b.kind === "formula" ? "formula" : "text",
    x: b.row ? b.col : 0,
    y: b.order,
    width: b.row ? b.colW : 1,
    height: 1,
    rotation: 0,
    zIndex: 0,
    content: { kind: b.kind, text: b.text, checked: b.checked, indent: b.indent, row: b.row },
    style: b.tint ? { tint: b.tint } : {},
    sourceId: null,
    groupId: null,
    createdBy: b.createdBy,
    updatedAt: new Date().toISOString(),
  };
}

export function newBlock(pageId: string, kind: BlockKind = "p", text = ""): Block {
  return {
    id: crypto.randomUUID(), pageId, kind, text, checked: false, indent: 0, tint: null,
    order: 0, row: null, col: 0, colW: 1, createdBy: null,
  };
}

/** Раскладка: верхний уровень по порядку, ряд встаёт на место своего первого блока */
export function layoutOf(blocks: Record<string, Block>): Item[] {
  const list = Object.values(blocks).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const items: Item[] = [];
  const rows = new Map<string, Map<number, Column>>();
  for (const b of list) {
    if (!b.row) { items.push({ type: "block", id: b.id }); continue; }
    let cols = rows.get(b.row);
    if (!cols) { cols = new Map(); rows.set(b.row, cols); items.push({ type: "row", id: b.row, cols: [] }); }
    const col = cols.get(b.col) ?? { w: b.colW, ids: [] };
    col.ids.push(b.id);
    cols.set(b.col, col);
  }
  for (const it of items) {
    if (it.type !== "row") continue;
    it.cols = [...rows.get(it.id)!.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
  }
  // ряд из одной колонки — просто блоки
  return items.flatMap((it): Item[] =>
    it.type === "row" && it.cols.length < 2 ? it.cols.flatMap((c) => c.ids.map((id) => ({ type: "block" as const, id }))) : [it]);
}

/** Блоки в порядке чтения: сверху вниз, колонки слева направо */
export function readingOrder(items: Item[]): string[] {
  return items.flatMap((it) => (it.type === "block" ? [it.id] : it.cols.flatMap((c) => c.ids)));
}

/** Где стоит блок: на верхнем уровне или в колонке ряда */
export function locate(items: Item[], id: string) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type === "block") { if (it.id === id) return { index: i, row: null, col: -1, pos: -1 }; continue; }
    for (let c = 0; c < it.cols.length; c++) {
      const pos = it.cols[c].ids.indexOf(id);
      if (pos >= 0) return { index: i, row: it, col: c, pos };
    }
  }
  return null;
}

/** Соседи блока внутри его контейнера (верхний уровень или колонка) */
export function siblings(items: Item[], id: string): string[] {
  const at = locate(items, id);
  if (!at) return [];
  if (at.row) return at.row.cols[at.col].ids;
  return items.filter((it): it is { type: "block"; id: string } => it.type === "block").map((it) => it.id);
}

const clone = (items: Item[]): Item[] =>
  items.map((it) => (it.type === "block" ? { ...it } : { ...it, cols: it.cols.map((c) => ({ w: c.w, ids: [...c.ids] })) }));

/** Убрать блоки из раскладки; пустые колонки исчезают, ряд из одной колонки распадается */
export function without(items: Item[], ids: string[]): Item[] {
  const drop = new Set(ids);
  return clone(items).flatMap((it): Item[] => {
    if (it.type === "block") return drop.has(it.id) ? [] : [it];
    const cols = it.cols.map((c) => ({ ...c, ids: c.ids.filter((x) => !drop.has(x)) })).filter((c) => c.ids.length);
    if (cols.length >= 2) return [{ ...it, cols }];
    return cols.flatMap((c) => c.ids.map((id) => ({ type: "block" as const, id })));
  });
}

export type Side = "before" | "after" | "left" | "right";

/** Вставить блоки рядом с целевым. left/right — колонкой рядом. null — цель не найдена. */
export function insertAt(items: Item[], ids: string[], target: string, side: Side): Item[] | null {
  const out = clone(items);
  const at = locate(out, target);
  if (!at) return null;
  if (!at.row) {
    if (side === "before" || side === "after") {
      out.splice(at.index + (side === "after" ? 1 : 0), 0, ...ids.map((id) => ({ type: "block" as const, id })));
    } else {
      const mine: Column = { w: 1, ids };
      const theirs: Column = { w: 1, ids: [target] };
      out[at.index] = { type: "row", id: crypto.randomUUID(), cols: side === "left" ? [mine, theirs] : [theirs, mine] };
    }
    return out;
  }
  const col = at.row.cols[at.col];
  if (side === "before" || side === "after") {
    col.ids.splice(at.pos + (side === "after" ? 1 : 0), 0, ...ids);
    return out;
  }
  if (at.row.cols.length >= MAX_COLUMNS) return null;
  const w = at.row.cols.reduce((s, c) => s + c.w, 0) / at.row.cols.length;
  at.row.cols.splice(at.col + (side === "right" ? 1 : 0), 0, { w, ids });
  return out;
}

/** В конец страницы */
export function append(items: Item[], ids: string[]): Item[] {
  return [...clone(items), ...ids.map((id) => ({ type: "block" as const, id }))];
}

const GAP = 1024;

/**
 * Перевести раскладку обратно в поля блоков. Меняет как можно меньше блоков:
 * сохраняет порядок самой длинной возрастающей подпоследовательности, остальным даёт значения между соседями.
 */
export function relayout(blocks: Record<string, Block>, items: Item[]): Record<string, Partial<Block>> {
  type Slot = { id: string; row: string | null; col: number; colW: number };
  const seq: Slot[] = items.flatMap((it): Slot[] =>
    it.type === "block"
      ? [{ id: it.id, row: null, col: 0, colW: 1 }]
      : it.cols.flatMap((c, ci) => c.ids.map((id) => ({ id, row: it.id, col: ci, colW: c.w }))));
  const orders = assignOrders(seq.map((s) => blocks[s.id]?.order ?? 0));
  const patches: Record<string, Partial<Block>> = {};
  seq.forEach((s, i) => {
    const b = blocks[s.id];
    if (!b) return;
    const p: Partial<Block> = {};
    if (b.order !== orders[i]) p.order = orders[i];
    if (b.row !== s.row) p.row = s.row;
    if (b.col !== s.col) p.col = s.col;
    if (b.colW !== s.colW) p.colW = s.colW;
    if (Object.keys(p).length) patches[s.id] = p;
  });
  return patches;
}

/** Новый строго возрастающий порядок, максимально совпадающий с текущим */
export function assignOrders(cur: number[]): number[] {
  const n = cur.length;
  if (!n) return [];
  // самая длинная строго возрастающая подпоследовательность (O(n log n))
  const tails: number[] = [];
  const prev = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cur[tails[m]] < cur[i]) lo = m + 1; else hi = m; }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const keep = new Set<number>();
  for (let i = tails.at(-1)!; i >= 0; i = prev[i]) keep.add(i);

  const out = [...cur];
  let i = 0;
  while (i < n) {
    if (keep.has(i)) { i++; continue; }
    let j = i;
    while (j < n && !keep.has(j)) j++;
    const lo = i > 0 ? out[i - 1] : null;
    const hi = j < n ? cur[j] : null;
    const k = j - i;
    for (let t = 1; t <= k; t++) {
      out[i + t - 1] =
        lo === null && hi === null ? t * GAP
        : lo === null ? hi! - (k + 1 - t) * GAP
        : hi === null ? lo + t * GAP
        : lo + ((hi - lo) * t) / (k + 1);
    }
    i = j;
  }
  // промежутки истощились — перенумеровать всё
  for (let t = 1; t < n; t++) if (!(out[t] - out[t - 1] > 1e-6)) return out.map((_, x) => (x + 1) * GAP);
  return out;
}

/** Номер пункта нумерованного списка: подряд идущие пункты одного уровня в одном контейнере */
export function listNumber(blocks: Record<string, Block>, sibs: string[], id: string): number {
  const me = blocks[id];
  let n = 1;
  for (let i = sibs.indexOf(id) - 1; i >= 0; i--) {
    const b = blocks[sibs[i]];
    if (!b) break;
    if (b.indent > me.indent) continue;
    if (b.kind !== "numbered" || b.indent < me.indent) break;
    n++;
  }
  return n;
}
