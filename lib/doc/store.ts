"use client";
import { create } from "zustand";
import { bindAutosave, markChanged, markRemoved } from "@/lib/editor/autosave";
import {
  append, insertAt, layoutOf, locate, newBlock, readingOrder, relayout, siblings, toElement, without,
  type Block, type BlockKind, type Item, type Side,
} from "./model";

export type Caret = number | "start" | "end";
export type HistoryEntry = {
  before: Record<string, Block | null>;
  after: Record<string, Block | null>;
  /** ввод текста в один блок склеивается в один шаг истории */
  key?: string;
  t: number;
};
export const HISTORY_LIMIT = 200;
const TYPING_MERGE_MS = 1200;

export type DocState = {
  pageId: string | null;
  canEdit: boolean;
  persist: boolean;
  blocks: Record<string, Block>;
  items: Item[];
  /** блок, который должен получить фокус; n меняется, чтобы повторить фокус в тот же блок */
  focus: { id: string; at: Caret; n: number } | null;
  /** выделенные блоки (Esc в блоке) */
  selected: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];

  init(p: { pageId: string; canEdit: boolean; blocks: Block[]; persist?: boolean }): void;
  focusBlock(id: string, at?: Caret): void;
  select(ids: string[]): void;

  setText(id: string, text: string): void;
  update(id: string, patch: Partial<Pick<Block, "kind" | "text" | "checked" | "indent" | "tint">>): void;
  /** Новый блок после указанного (в том же контейнере); null — в конец страницы */
  insertAfter(id: string | null, init?: Partial<Pick<Block, "kind" | "text" | "indent">>, focus?: Caret): string;
  /** Несколько новых блоков подряд после указанного (вставка многострочного текста) — один шаг истории */
  insertBlocks(afterId: string, inits: Partial<Pick<Block, "kind" | "text" | "indent">>[]): string[];
  /** Разрезать блок: текущий получает head, новый блок после — tail */
  split(id: string, head: string, tail: string, kind: BlockKind): string;
  /** Склеить блок с предыдущим в порядке чтения */
  mergeUp(id: string): boolean;
  remove(ids: string[], focusNeighbor?: boolean): void;
  move(ids: string[], target: string | null, side: Side): boolean;
  moveBy(id: string, dir: -1 | 1): void;
  duplicate(ids: string[]): void;
  setColumnWidths(rowId: string, widths: number[]): void;

  undo(): void;
  redo(): void;
};

let focusN = 0;

export const useDoc = create<DocState>((set, get) => {
  /** Применить изменение: блоки, раскладка, история, автосохранение */
  function commit(before: HistoryEntry["before"], after: HistoryEntry["after"], opts: { kind?: "text" | "geometry"; key?: string; history?: boolean } = {}) {
    const blocks = { ...get().blocks };
    for (const [id, b] of Object.entries(after)) { if (b) blocks[id] = b; else delete blocks[id]; }
    const items = layoutOf(blocks);
    const now = Date.now();
    let { past } = get();
    const last = past.at(-1);
    if (opts.history !== false) {
      if (opts.key && last?.key === opts.key && now - last.t < TYPING_MERGE_MS && !get().future.length) {
        past = [...past.slice(0, -1), { ...last, after: { ...last.after, ...after }, t: now }];
      } else {
        past = [...past, { before, after, key: opts.key, t: now }].slice(-HISTORY_LIMIT);
      }
    }
    set({ blocks, items, past, future: opts.history === false ? get().future : [] });
    save(after, opts.kind);
  }

  function save(after: HistoryEntry["after"], kind: "text" | "geometry" = "geometry") {
    if (!get().persist) return;
    const changed = Object.keys(after).filter((id) => after[id]);
    const removed = Object.keys(after).filter((id) => !after[id]);
    if (changed.length) markChanged(changed, kind);
    if (removed.length) markRemoved(removed);
  }

  /** Новая раскладка → изменения полей блоков; extra — новые/изменённые блоки */
  function restructure(items: Item[], extra: Record<string, Block> = {}, removed: string[] = []) {
    const cur = { ...get().blocks, ...extra };
    removed.forEach((id) => delete cur[id]);
    const patches = relayout(cur, items);
    const before: HistoryEntry["before"] = {};
    const after: HistoryEntry["after"] = {};
    const touch = new Set([...Object.keys(patches), ...Object.keys(extra)]);
    for (const id of touch) {
      before[id] = get().blocks[id] ?? null;
      after[id] = { ...cur[id], ...patches[id] };
    }
    for (const id of removed) { before[id] = get().blocks[id] ?? null; after[id] = null; }
    commit(before, after);
  }

  function edit(id: string, patch: Partial<Block>, key?: string) {
    const b = get().blocks[id];
    if (!b || !get().canEdit) return;
    commit({ [id]: b }, { [id]: { ...b, ...patch } }, { kind: key ? "text" : "geometry", key });
  }

  function restore(state: HistoryEntry["before"]) {
    commit({}, state, { history: false });
    const first = Object.keys(state).find((id) => state[id] && get().blocks[id]);
    if (first) get().focusBlock(first, "end");
  }

  return {
    pageId: null,
    canEdit: false,
    persist: true,
    blocks: {},
    items: [],
    focus: null,
    selected: [],
    past: [],
    future: [],

    init({ pageId, canEdit, blocks, persist = true }) {
      const map = Object.fromEntries(blocks.map((b) => [b.id, b]));
      if (persist) bindAutosave((id) => { const b = get().blocks[id]; return b ? toElement(b) : undefined; });
      set({ pageId, canEdit, persist, blocks: map, items: layoutOf(map), focus: null, selected: [], past: [], future: [] });
    },
    focusBlock(id, at = "end") { set({ focus: { id, at, n: ++focusN }, selected: [] }); },
    select(ids) { set({ selected: ids }); },

    setText(id, text) { if (get().blocks[id]?.text !== text) edit(id, { text }, `text:${id}`); },
    update(id, patch) { edit(id, patch); },

    insertAfter(id, init = {}, focus = "start") {
      const { pageId, items } = get();
      const b = { ...newBlock(pageId!, init.kind ?? "p", init.text ?? ""), indent: init.indent ?? 0 };
      const next = (id && insertAt(items, [b.id], id, "after")) || append(items, [b.id]);
      restructure(next, { [b.id]: b });
      get().focusBlock(b.id, focus);
      return b.id;
    },

    insertBlocks(afterId, inits) {
      const { pageId } = get();
      const made = inits.map((x) => ({ ...newBlock(pageId!, x.kind ?? "p", x.text ?? ""), indent: x.indent ?? 0 }));
      let next = get().items;
      let prev = afterId;
      for (const b of made) { next = insertAt(next, [b.id], prev, "after") ?? append(next, [b.id]); prev = b.id; }
      restructure(next, Object.fromEntries(made.map((b) => [b.id, b])));
      if (made.length) get().focusBlock(made.at(-1)!.id, "end");
      return made.map((b) => b.id);
    },

    split(id, head, tail, kind) {
      const cur = get().blocks[id];
      const b = { ...newBlock(get().pageId!, kind, tail), indent: cur.indent, tint: kind === cur.kind ? cur.tint : null };
      const next = insertAt(get().items, [b.id], id, "after")!;
      restructure(next, { [id]: { ...cur, text: head }, [b.id]: b });
      get().focusBlock(b.id, "start");
      return b.id;
    },

    mergeUp(id) {
      const { blocks, items } = get();
      const order = readingOrder(items);
      const i = order.indexOf(id);
      const prev = i > 0 ? blocks[order[i - 1]] : null;
      const cur = blocks[id];
      if (!prev || !cur) return false;
      if (prev.kind === "divider") { get().remove([prev.id]); get().focusBlock(id, "start"); return true; }
      if (prev.kind === "formula" || prev.kind === "code") { get().focusBlock(prev.id, "end"); return true; }
      const joinAt = prevLength(prev.text);
      restructure(without(items, [id]), { [prev.id]: { ...prev, text: prev.text + cur.text } }, [id]);
      get().focusBlock(prev.id, joinAt);
      return true;
    },

    remove(ids, focusNeighbor = false) {
      const { items, blocks } = get();
      if (!get().canEdit || !ids.length) return;
      const order = readingOrder(items);
      const first = order.findIndex((x) => ids.includes(x));
      const neighbor = order.slice(0, Math.max(0, first)).reverse().find((x) => !ids.includes(x))
        ?? order.find((x, i) => i > first && !ids.includes(x));
      restructure(without(items, ids), {}, ids.filter((x) => blocks[x]));
      set({ selected: get().selected.filter((x) => !ids.includes(x)) });
      if (focusNeighbor && neighbor) get().focusBlock(neighbor, "end");
    },

    move(ids, target, side) {
      if (!get().canEdit || (target && ids.includes(target))) return false;
      const rest = without(get().items, ids);
      const next = target ? insertAt(rest, ids, target, side) : append(rest, ids);
      if (!next) return false;
      restructure(next);
      return true;
    },

    moveBy(id, dir) {
      const { items } = get();
      const sibs = siblings(items, id);
      const i = sibs.indexOf(id);
      const j = i + dir;
      if (i < 0) return;
      if (j >= 0 && j < sibs.length) { get().move([id], sibs[j], dir < 0 ? "before" : "after"); return; }
      // из колонки — над рядом или под ним
      const at = locate(items, id);
      if (!at?.row) return;
      const row = at.row;
      const others = new Set(row.cols.flatMap((c) => c.ids).filter((x) => x !== id));
      const rest = without(items, [id]);
      const inRow = (it: Item) => (it.type === "row" ? it.id === row.id : others.has(it.id));
      const from = rest.findIndex(inRow);
      const to = rest.findLastIndex(inRow);
      const out = [...rest];
      out.splice(dir < 0 ? from : to + 1, 0, { type: "block", id });
      restructure(out);
    },

    duplicate(ids) {
      const { blocks, items } = get();
      let next = items;
      const extra: Record<string, Block> = {};
      let last = "";
      for (const id of readingOrder(items).filter((x) => ids.includes(x))) {
        const copy = { ...blocks[id], id: crypto.randomUUID(), createdBy: null };
        extra[copy.id] = copy;
        next = insertAt(next, [copy.id], id, "after") ?? next;
        last = copy.id;
      }
      if (!last) return;
      restructure(next, extra);
      set({ selected: Object.keys(extra) });
    },

    setColumnWidths(rowId, widths) {
      const items = get().items.map((it) =>
        it.type === "row" && it.id === rowId ? { ...it, cols: it.cols.map((c, i) => ({ ...c, w: widths[i] ?? c.w })) } : it);
      restructure(items);
    },

    undo() {
      const { past, future } = get();
      const entry = past.at(-1);
      if (!entry) return;
      set({ past: past.slice(0, -1), future: [...future, entry] });
      restore(entry.before);
    },
    redo() {
      const { past, future } = get();
      const entry = future.at(-1);
      if (!entry) return;
      set({ future: future.slice(0, -1), past: [...past, { ...entry, key: undefined }] });
      restore(entry.after);
    },
  };
});

/** Длина текста блока в символах (для каретки после склейки) */
function prevLength(html: string): number {
  if (typeof document === "undefined") return html.length;
  const tpl = document.createElement("template");
  tpl.innerHTML = html.replace(/<br\s*\/?>/g, "\n");
  return tpl.content.textContent?.length ?? 0;
}
