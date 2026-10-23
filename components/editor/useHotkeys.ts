"use client";
import { useEffect } from "react";
import { toast } from "@/components/ui";
import { cloneElements } from "@/lib/editor/clone";
import { bbox, fitRect } from "@/lib/editor/geometry";
import { BOUNDARY_MESSAGE, useEditor } from "@/lib/editor/store";
import type { CanvasElement } from "@/lib/types";

const MARK = "nexora/elements";
let clipboard: CanvasElement[] = [];
let pasteCount = 0;

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName));

/** Выделенные объекты вместе с участниками их групп и самими группами */
export function withGroups(ids: string[]): CanvasElement[] {
  const { els } = useEditor.getState();
  const set = new Set(ids);
  for (const id of ids) {
    const g = els[id]?.groupId;
    if (g) { set.add(g); Object.values(els).forEach((e) => e.groupId === g && set.add(e.id)); }
  }
  return [...set].map((id) => els[id]).filter(Boolean);
}

export function copySelection() {
  const st = useEditor.getState();
  clipboard = withGroups(st.selected);
  pasteCount = 0;
  if (clipboard.length) navigator.clipboard?.writeText(JSON.stringify({ [MARK]: clipboard })).catch(() => {});
}

export function pasteElements(src: CanvasElement[], offset: number) {
  const st = useEditor.getState();
  if (!st.canEdit || !src.length || !st.canvasId) return;
  const z = Math.max(0, ...Object.values(st.els).map((e) => e.zIndex)) + 1;
  const copies = cloneElements(src, offset, offset, z, st.canvasId);
  if (!st.add(copies)) return toast(BOUNDARY_MESSAGE);
  st.select(copies.filter((e) => e.type !== "group").map((e) => e.id));
}

export function duplicateSelection() { pasteElements(withGroups(useEditor.getState().selected), 24); }

export function deleteSelection() {
  const st = useEditor.getState();
  if (!st.canEdit || !st.selected.length) return;
  const ids = withGroups(st.selected).map((e) => e.id);
  // связи с удалёнными объектами удаляются вместе с ними
  const links = Object.values(st.els).filter((e) => e.type === "connector" &&
    (ids.includes(e.content.fromId as string) || ids.includes(e.content.toId as string))).map((e) => e.id);
  st.remove([...new Set([...ids, ...links])]);
}

/** Горячие клавиши редактора (подсказки — в меню и тултипах) */
export function useHotkeys(view: () => { width: number; height: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && k === "y") { e.preventDefault(); st.redo(); return; }
      if (mod && k === "a") { e.preventDefault(); st.select(Object.values(st.els).filter((x) => x.type !== "group").map((x) => x.id)); return; }
      if (mod && k === "c") { copySelection(); return; }
      if (mod && k === "x") { copySelection(); deleteSelection(); return; }
      if (mod && k === "d") { e.preventDefault(); duplicateSelection(); return; }
      if (e.key === "Escape") { st.select([]); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); return; }

      if (e.key.startsWith("Arrow") && st.selected.length && st.canEdit) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const items = withGroups(st.selected);
        if (!st.apply(Object.fromEntries(items.map((x) => [x.id, { x: x.x + dx, y: x.y + dy }])))) toast(BOUNDARY_MESSAGE);
        return;
      }

      const v = view();
      const center = { x: v.width / 2, y: v.height / 2 };
      if (!mod && (e.key === "+" || e.key === "=")) st.zoomTo(center, st.camera.zoom * 1.25);
      else if (!mod && e.key === "-") st.zoomTo(center, st.camera.zoom / 1.25);
      else if (!mod && e.key === "0") st.zoomTo(center, 1);
      else if (e.shiftKey && e.code === "Digit1") {
        const box = bbox(Object.values(st.els));
        if (box) st.setCamera(fitRect(box, v));
      } else if (e.shiftKey && e.code === "Digit2") {
        const box = bbox(withGroups(st.selected));
        if (box) st.setCamera(fitRect(box, v));
      }
    };

    // вставка: свои объекты из буфера, иначе — текст новой заметкой (картинки — спринт 4)
    const onPaste = (e: ClipboardEvent) => {
      if (typing(e.target)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      try {
        const parsed = JSON.parse(text);
        if (parsed?.[MARK]) { e.preventDefault(); pasteCount++; pasteElements(parsed[MARK], 24 * pasteCount); return; }
      } catch {}
      if (clipboard.length && !text) { e.preventDefault(); pasteCount++; pasteElements(clipboard, 24 * pasteCount); }
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("paste", onPaste); };
  }, [view]);
}
