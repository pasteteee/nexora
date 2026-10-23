"use client";
import { useEffect } from "react";
import { toast } from "@/components/ui";
import { cloneElements } from "@/lib/editor/clone";
import { bbox, fitRect } from "@/lib/editor/geometry";
import { BOUNDARY_MESSAGE, useEditor } from "@/lib/editor/store";
import { arrangeZ, deleteSelection, groupSelection, insertImages, startEditing, ungroupSelection, withGroups } from "@/lib/editor/actions";
import { rectOf, translate } from "@/lib/editor/connector";
import { useUi, type Tool } from "@/lib/editor/ui";
import type { CanvasElement } from "@/lib/types";

export { deleteSelection, withGroups };

const TOOL_KEYS: Record<string, Tool> = { v: "select", t: "text", n: "note", r: "shape", o: "diagram_node", l: "connector", f: "formula" };

const MARK = "nexora/elements";
let clipboard: CanvasElement[] = [];
let pasteCount = 0;

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName));

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

export const hasClipboard = () => clipboard.length > 0;
export function pasteClipboard() { pasteCount++; pasteElements(clipboard, 24 * pasteCount); }

export function duplicateSelection() { pasteElements(withGroups(useEditor.getState().selected), 24); }

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
      if (mod && k === "g") { e.preventDefault(); if (e.shiftKey) ungroupSelection(); else groupSelection(); return; }
      if (e.key === "]" || e.key === "[") {
        e.preventDefault();
        arrangeZ(e.key === "]" ? (mod ? "front" : "forward") : (mod ? "back" : "backward"));
        return;
      }
      if (e.key === "Escape") { useUi.getState().setTool("select"); st.select([]); return; }
      if (e.key === "Enter" && st.selected.length === 1) { e.preventDefault(); startEditing(st.selected[0]); return; }
      if (!mod && !e.altKey && !e.shiftKey && TOOL_KEYS[k] && st.canEdit) { useUi.getState().setTool(TOOL_KEYS[k]); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); return; }

      if (e.key.startsWith("Arrow") && st.selected.length && st.canEdit) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const items = withGroups(st.selected);
        if (!st.apply(Object.fromEntries(items.map((x) => [x.id, translate(x, dx, dy)])))) toast(BOUNDARY_MESSAGE);
        return;
      }

      const v = view();
      const center = { x: v.width / 2, y: v.height / 2 };
      if (!mod && (e.key === "+" || e.key === "=")) st.zoomTo(center, st.camera.zoom * 1.25);
      else if (!mod && e.key === "-") st.zoomTo(center, st.camera.zoom / 1.25);
      else if (!mod && e.key === "0") st.zoomTo(center, 1);
      else if (e.shiftKey && e.code === "Digit1") {
        const box = bbox(Object.values(st.els).map((x) => rectOf(x, st.els)));
        if (box) st.setCamera(fitRect(box, v));
      } else if (e.shiftKey && e.code === "Digit2") {
        const box = bbox(withGroups(st.selected).map((x) => rectOf(x, st.els)));
        if (box) st.setCamera(fitRect(box, v));
      }
    };

    // вставка: изображения из буфера, свои объекты, иначе — объекты из внутреннего буфера
    const onPaste = (e: ClipboardEvent) => {
      if (typing(e.target)) return;
      const images = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (images.length) { e.preventDefault(); insertImages(images); return; }
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
