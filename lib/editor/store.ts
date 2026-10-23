"use client";
import { create } from "zustand";
import type { BackgroundType, CanvasElement } from "@/lib/types";
import { bindAutosave } from "./autosave";
import { markChanged, markRemoved } from "./autosave";
import { fitBounds, WORLD, zoomAt, type Bounds, type Camera, type Pt } from "./geometry";

export type EditorState = {
  canvasId: string | null;
  canEdit: boolean;
  camera: Camera;
  bounds: Bounds;
  background: { type: BackgroundType; spacing: 16 | 24 | 32 | 48 };
  els: Record<string, CanvasElement>;
  selected: string[];

  init(p: { canvasId: string; canEdit: boolean; els: CanvasElement[]; background: EditorState["background"]; camera?: Camera }): void;
  setCamera(c: Camera): void;
  panBy(dx: number, dy: number): void;
  zoomTo(screen: Pt, zoom: number): void;
  setBackground(b: Partial<EditorState["background"]>): void;

  select(ids: string[], mode?: "replace" | "add" | "toggle"): void;
  /** Локальное изменение без сохранения — во время перетаскивания */
  preview(patches: Record<string, Partial<CanvasElement>>): void;
  /** Зафиксировать изменения: проверка границ мира и автосохранение. false — отклонено. */
  apply(patches: Record<string, Partial<CanvasElement>>, kind?: "geometry" | "text"): boolean;
  add(els: CanvasElement[]): boolean;
  remove(ids: string[]): void;
};

export const BOUNDARY_MESSAGE = "Достигнута граница страницы";

const CAMERA_KEY = (id: string) => `nexora:camera:${id}`;

/** Стартовая позиция камеры — пользовательская настройка в localStorage (ТЗ 4.2.3) */
export function loadCamera(canvasId: string): Camera | null {
  try { const raw = localStorage.getItem(CAMERA_KEY(canvasId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
let camTimer: ReturnType<typeof setTimeout> | undefined;
function persistCamera(canvasId: string | null, c: Camera) {
  if (!canvasId) return;
  clearTimeout(camTimer);
  camTimer = setTimeout(() => { try { localStorage.setItem(CAMERA_KEY(canvasId), JSON.stringify(c)); } catch {} }, 300);
}

/** Границы мира по уже размещённым объектам */
export function boundsFor(els: CanvasElement[]): Bounds {
  let hx = WORLD.initial, hy = WORLD.initial;
  for (const e of els) {
    hx = Math.max(hx, Math.abs(e.x), Math.abs(e.x + e.width));
    hy = Math.max(hy, Math.abs(e.y), Math.abs(e.y + e.height));
  }
  const up = (h: number) => Math.min(WORLD.max, Math.ceil(h / WORLD.step) * WORLD.step);
  return { hx: up(hx), hy: up(hy) };
}

export const useEditor = create<EditorState>((set, get) => ({
  canvasId: null,
  canEdit: false,
  camera: { x: 0, y: 0, zoom: 1 },
  bounds: { hx: WORLD.initial, hy: WORLD.initial },
  background: { type: "grid", spacing: 24 },
  els: {},
  selected: [],

  init({ canvasId, canEdit, els, background, camera }) {
    bindAutosave((id) => get().els[id]);
    set({
      canvasId, canEdit, background,
      els: Object.fromEntries(els.map((e) => [e.id, e])),
      bounds: boundsFor(els),
      selected: [],
      camera: camera ?? { x: 0, y: 0, zoom: 1 },
    });
  },
  setCamera(c) { set({ camera: c }); persistCamera(get().canvasId, c); },
  panBy(dx, dy) { const c = get().camera; get().setCamera({ ...c, x: c.x + dx, y: c.y + dy }); },
  zoomTo(screen, zoom) { get().setCamera(zoomAt(get().camera, screen, zoom)); },
  setBackground(b) { set({ background: { ...get().background, ...b } }); },

  select(ids, mode = "replace") {
    const cur = new Set(get().selected);
    if (mode === "replace") return set({ selected: [...new Set(ids)] });
    for (const id of ids) {
      if (mode === "toggle" && cur.has(id)) cur.delete(id); else cur.add(id);
    }
    set({ selected: [...cur] });
  },
  preview(patches) {
    const els = { ...get().els };
    for (const [id, p] of Object.entries(patches)) if (els[id]) els[id] = { ...els[id], ...p };
    set({ els });
  },
  apply(patches, kind = "geometry") {
    const els = { ...get().els };
    let bounds = get().bounds;
    for (const [id, p] of Object.entries(patches)) {
      if (!els[id]) continue;
      const next = { ...els[id], ...p };
      const b = fitBounds(bounds, next);
      if (!b) return false;
      bounds = b;
      els[id] = next;
    }
    set({ els, bounds });
    markChanged(Object.keys(patches), kind);
    return true;
  },
  add(list) {
    const els = { ...get().els };
    let bounds = get().bounds;
    for (const e of list) { const b = fitBounds(bounds, e); if (!b) return false; bounds = b; els[e.id] = e; }
    set({ els, bounds });
    markChanged(list.map((e) => e.id));
    return true;
  },
  remove(ids) {
    const els = { ...get().els };
    ids.forEach((id) => delete els[id]);
    set({ els, selected: get().selected.filter((id) => !ids.includes(id)) });
    markRemoved(ids);
  },
}));
