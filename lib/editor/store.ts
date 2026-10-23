"use client";
import { create } from "zustand";
import type { BackgroundType, CanvasElement } from "@/lib/types";
import { WORLD, zoomAt, type Bounds, type Camera, type Pt } from "./geometry";

export type EditorState = {
  canvasId: string | null;
  canEdit: boolean;
  camera: Camera;
  bounds: Bounds;
  background: { type: BackgroundType; spacing: 16 | 24 | 32 | 48 };
  els: Record<string, CanvasElement>;

  init(p: { canvasId: string; canEdit: boolean; els: CanvasElement[]; background: EditorState["background"]; camera?: Camera }): void;
  setCamera(c: Camera): void;
  panBy(dx: number, dy: number): void;
  zoomTo(screen: Pt, zoom: number): void;
  setBackground(b: Partial<EditorState["background"]>): void;
};

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

  init({ canvasId, canEdit, els, background, camera }) {
    set({
      canvasId, canEdit, background,
      els: Object.fromEntries(els.map((e) => [e.id, e])),
      bounds: boundsFor(els),
      camera: camera ?? { x: 0, y: 0, zoom: 1 },
    });
  },
  setCamera(c) { set({ camera: c }); persistCamera(get().canvasId, c); },
  panBy(dx, dy) { const c = get().camera; get().setCamera({ ...c, x: c.x + dx, y: c.y + dy }); },
  zoomTo(screen, zoom) { get().setCamera(zoomAt(get().camera, screen, zoom)); },
  setBackground(b) { set({ background: { ...get().background, ...b } }); },
}));
