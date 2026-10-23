"use client";
/** Меню «/»: выбор типа блока прямо при наборе */
import type { KeyboardEvent } from "react";
import { create } from "zustand";
import { deleteChars } from "@/lib/doc/html";
import { KINDS, type BlockKind } from "@/lib/doc/model";
import { useDoc } from "@/lib/doc/store";
import { KIND_META } from "./kinds";

type SlashState = {
  open: boolean;
  id: string;
  /** позиция символа «/» в тексте блока */
  start: number;
  x: number;
  y: number;
  query: string;
  index: number;
  show(id: string, start: number, x: number, y: number): void;
  setQuery(q: string): void;
  setIndex(i: number): void;
  close(): void;
  closeFor(id: string): void;
  onKey(e: KeyboardEvent): boolean;
  choose(kind: BlockKind): void;
};

export function slashItems(query: string): BlockKind[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...KINDS];
  return KINDS.filter((k) => KIND_META[k].label.toLowerCase().includes(q) || KIND_META[k].keys.includes(q));
}

export const useSlash = create<SlashState>((set, get) => ({
  open: false, id: "", start: 0, x: 0, y: 0, query: "", index: 0,
  show(id, start, x, y) { set({ open: true, id, start, x, y, query: "", index: 0 }); },
  setQuery(query) { set({ query, index: 0 }); if (!slashItems(query).length && query.length > 3) get().close(); },
  setIndex(index) { set({ index }); },
  close() { if (get().open) set({ open: false }); },
  // blur срабатывает и при клике по меню — закрываем чуть позже, если фокус не вернулся
  closeFor(id) { setTimeout(() => { if (get().id === id && !document.activeElement?.closest(`[data-block-id="${id}"]`)) get().close(); }, 150); },

  onKey(e) {
    const list = slashItems(get().query);
    if (e.key === "Escape") { e.preventDefault(); get().close(); return true; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      set({ index: (get().index + d + list.length) % Math.max(1, list.length) });
      return true;
    }
    if ((e.key === "Enter" || e.key === "Tab") && list.length) {
      e.preventDefault();
      get().choose(list[Math.min(get().index, list.length - 1)]);
      return true;
    }
    return false;
  },

  choose(kind) {
    const { id, start, query } = get();
    set({ open: false });
    const doc = useDoc.getState();
    const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"] [data-editable]`);
    if (!el || !doc.blocks[id]) return;
    const rest = deleteChars(el, start, start + 1 + query.length);
    if (rest === "") {
      doc.update(id, { kind, text: "" });
      if (kind === "divider") doc.insertAfter(id);
      else doc.focusBlock(id, "start");
      return;
    }
    doc.setText(id, rest);
    const created = doc.insertAfter(id, { kind });
    if (kind === "divider") doc.insertAfter(created);
  },
}));
