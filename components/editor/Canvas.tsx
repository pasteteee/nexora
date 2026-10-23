"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui";
import { intersects, normRect, resizeRect, toWorld, type Handle, type Pt, type Rect } from "@/lib/editor/geometry";
import { BOUNDARY_MESSAGE, useEditor } from "@/lib/editor/store";
import type { CanvasElement } from "@/lib/types";
import { SelectionOverlay } from "./SelectionOverlay";
import { useHotkeys } from "./useHotkeys";
import { backgroundStyle } from "./Background";
import { BackgroundPicker } from "./BackgroundPicker";
import { ElementView } from "./elements/ElementView";
import { ZoomBar } from "./ZoomBar";
import s from "./editor.module.css";

export function Canvas() {
  const ref = useRef<HTMLDivElement>(null);
  const camera = useEditor((st) => st.camera);
  const background = useEditor((st) => st.background);
  const bounds = useEditor((st) => st.bounds);
  const els = useEditor((st) => st.els);
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  type Gesture =
    | { kind: "move"; start: Pt; orig: Record<string, CanvasElement>; moved: boolean }
    | { kind: "resize"; start: Pt; orig: CanvasElement; handle: Handle }
    | { kind: "marquee"; start: Pt; base: string[]; additive: boolean };
  const gesture = useRef<Gesture | null>(null);

  const view = useCallback(() => ref.current?.getBoundingClientRect() ?? { width: 1, height: 1, left: 0, top: 0 }, []);
  useHotkeys(view);

  // колесо: pinch/Ctrl — масштаб вокруг курсора, иначе — прокрутка камеры
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = useEditor.getState();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        st.zoomTo({ x: e.clientX - r.left, y: e.clientY - r.top }, st.camera.zoom * Math.exp(-e.deltaY * 0.01));
      } else {
        st.panBy(-(e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), e.shiftKey && !e.deltaX ? 0 : -e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // пробел — временная «рука»
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /INPUT|TEXTAREA/.test(t.tagName));
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e.target)) { e.preventDefault(); setSpace(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpace(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // первый вход: начало координат по центру экрана
  useEffect(() => {
    const st = useEditor.getState();
    if (st.camera.x === 0 && st.camera.y === 0) {
      const r = view();
      st.setCamera({ x: r.width / 2, y: r.height / 2, zoom: st.camera.zoom });
    }
  }, [view]);

  const local = (e: { clientX: number; clientY: number }): Pt => { const r = view(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const world = (e: { clientX: number; clientY: number }) => toWorld(local(e), useEditor.getState().camera);

  /** Объект под курсором; объект в группе выделяет всю группу */
  function hit(target: EventTarget): string[] | null {
    const id = (target as HTMLElement).closest?.("[data-id]")?.getAttribute("data-id");
    if (!id) return null;
    const { els } = useEditor.getState();
    const g = els[id]?.groupId;
    return g ? Object.values(els).filter((x) => x.groupId === g && x.type !== "group").map((x) => x.id) : [id];
  }

  function onPointerDown(e: React.PointerEvent) {
    const st = useEditor.getState();
    if (e.button === 1 || space) {
      e.preventDefault();
      ref.current!.setPointerCapture(e.pointerId);
      pan.current = { x: e.clientX, y: e.clientY };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    ref.current!.focus({ preventScroll: true });
    const ids = hit(e.target);
    if (ids) {
      if (e.shiftKey) st.select(ids, "toggle");
      else if (!ids.every((id) => st.selected.includes(id))) st.select(ids);
      if (!st.canEdit || (e.target as HTMLElement).isContentEditable) return;
      ref.current!.setPointerCapture(e.pointerId);
      const sel = useEditor.getState().selected;
      gesture.current = { kind: "move", start: world(e), orig: Object.fromEntries(sel.map((id) => [id, st.els[id]])), moved: false };
      return;
    }
    ref.current!.setPointerCapture(e.pointerId);
    if (!e.shiftKey) st.select([]);
    gesture.current = { kind: "marquee", start: local(e), base: e.shiftKey ? st.selected : [], additive: e.shiftKey };
  }

  function onHandleDown(e: React.PointerEvent, handle: Handle) {
    e.stopPropagation();
    const st = useEditor.getState();
    ref.current!.setPointerCapture(e.pointerId);
    gesture.current = { kind: "resize", start: world(e), orig: st.els[st.selected[0]], handle };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pan.current) {
      useEditor.getState().panBy(e.clientX - pan.current.x, e.clientY - pan.current.y);
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const st = useEditor.getState();
    if (g.kind === "move") {
      const p = world(e);
      const dx = p.x - g.start.x, dy = p.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) * st.camera.zoom < 3) return;
      g.moved = true;
      st.preview(Object.fromEntries(Object.values(g.orig).map((o) => [o.id, { x: o.x + dx, y: o.y + dy }])));
    } else if (g.kind === "resize") {
      const p = world(e);
      const r = resizeRect(g.orig, g.handle, p.x - g.start.x, p.y - g.start.y, e.shiftKey || g.orig.type === "image");
      st.preview({ [g.orig.id]: r });
    } else {
      const r = normRect(g.start, local(e));
      setMarquee(r);
      const tl = toWorld({ x: r.x, y: r.y }, st.camera);
      const wr = { x: tl.x, y: tl.y, width: r.width / st.camera.zoom, height: r.height / st.camera.zoom };
      const inside = Object.values(st.els).filter((x) => x.type !== "group" && intersects(x, wr)).map((x) => x.id);
      st.select([...g.base, ...inside]);
    }
  }

  function onPointerUp() {
    pan.current = null; setPanning(false);
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    if (!g || g.kind === "marquee" || (g.kind === "move" && !g.moved)) return;
    const st = useEditor.getState();
    const ids = g.kind === "move" ? Object.keys(g.orig) : [g.orig.id];
    const patches = Object.fromEntries(ids.map((id) => {
      const e = st.els[id];
      return [id, { x: e.x, y: e.y, width: e.width, height: e.height }];
    }));
    const before = g.kind === "move" ? g.orig : { [g.orig.id]: g.orig };
    if (!st.apply(patches, "geometry", before)) {
      st.preview(before);
      toast(BOUNDARY_MESSAGE);
    }
  }

  /** Двойной клик по пустому месту — новая заметка */
  function onDoubleClick(e: React.MouseEvent) {
    const st = useEditor.getState();
    if (!st.canEdit || hit(e.target)) return;
    const p = world(e);
    const z = Math.max(0, ...Object.values(st.els).map((x) => x.zIndex)) + 1;
    const el: CanvasElement = {
      id: crypto.randomUUID(), canvasId: st.canvasId!, type: "note", x: p.x - 100, y: p.y - 60, width: 200, height: 120,
      rotation: 0, zIndex: z, content: { text: "" }, style: { fill: "var(--note-yellow)" },
      sourceId: null, groupId: null, createdBy: null, updatedAt: new Date().toISOString(),
    };
    if (!st.add([el])) return toast(BOUNDARY_MESSAGE);
    st.select([el.id]);
  }

  return (
    <>
      <div
        ref={ref}
        tabIndex={0}
        className={`${s.viewport} ${panning ? s.panning : space ? s.spaceReady : ""}`}
        style={backgroundStyle(background.type, background.spacing, camera)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div className={s.world} style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
          <div className={s.boundary} style={{ left: -bounds.hx, top: -bounds.hy, width: bounds.hx * 2, height: bounds.hy * 2 }} />
          {Object.values(els).map((el) => <ElementView key={el.id} el={el} />)}
        </div>
        <SelectionOverlay marquee={marquee} onHandleDown={onHandleDown} />
      </div>
      <ZoomBar view={view} />
      <BackgroundPicker />
    </>
  );
}
