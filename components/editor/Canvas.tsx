"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, toast, type MenuItem } from "@/components/ui";
import { create, insertImages, insertSources, startEditing } from "@/lib/editor/actions";
import { isBound, rectOf, translate } from "@/lib/editor/connector";
import { intersects, normRect, resizeRect, toWorld, type Handle, type Pt, type Rect } from "@/lib/editor/geometry";
import { BOUNDARY_MESSAGE, useEditor } from "@/lib/editor/store";
import { useUi } from "@/lib/editor/ui";
import type { CanvasElement } from "@/lib/types";
import { ConnectorLayer } from "./ConnectorLayer";
import { contextItems } from "./contextMenu";
import { PropsBar } from "./PropsBar";
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
  const [draft, setDraft] = useState<{ a: Pt; b: Pt } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dropping, setDropping] = useState(false);
  const tool = useUi((u) => u.tool);
  type Gesture =
    | { kind: "move"; start: Pt; orig: Record<string, CanvasElement>; moved: boolean }
    | { kind: "resize"; start: Pt; orig: CanvasElement; handle: Handle }
    | { kind: "marquee"; start: Pt; base: string[]; additive: boolean }
    | { kind: "connect"; start: Pt; fromId: string | null };
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

  /** Объект непосредственно под курсором, без учёта групп */
  const targetId = (t: EventTarget) => (t as Element).closest?.("[data-id]")?.getAttribute("data-id") ?? null;

  function onPointerDown(e: React.PointerEvent) {
    const st = useEditor.getState();
    const ui = useUi.getState();
    if (e.button === 1 || space) {
      e.preventDefault();
      ref.current!.setPointerCapture(e.pointerId);
      pan.current = { x: e.clientX, y: e.clientY };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).isContentEditable || (e.target as HTMLElement).tagName === "TEXTAREA") return;
    // без выделения текста страницы и системного перетаскивания, которое прерывает жест
    e.preventDefault();
    getSelection()?.removeAllRanges();
    ref.current!.focus({ preventScroll: true });
    if (ui.tool === "connector" && st.canEdit) {
      const id = targetId(e.target);
      const from = id && st.els[id]?.type !== "connector" ? id : null;
      ref.current!.setPointerCapture(e.pointerId);
      gesture.current = { kind: "connect", start: world(e), fromId: from };
      return;
    }
    if (ui.tool !== "select" && st.canEdit) {
      const el = create(ui.tool, world(e));
      ui.setTool("select");
      if (el) startEditing(el.id);
      return;
    }
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
      st.preview(Object.fromEntries(Object.values(g.orig).map((o) => [o.id, translate(o, dx, dy)])));
    } else if (g.kind === "resize") {
      const p = world(e);
      const r = resizeRect(g.orig, g.handle, p.x - g.start.x, p.y - g.start.y, e.shiftKey || g.orig.type === "image");
      st.preview({ [g.orig.id]: r });
    } else if (g.kind === "connect") {
      const id = targetId(e.target);
      const to = id && id !== g.fromId && st.els[id] && st.els[id].type !== "connector" ? st.els[id] : null;
      const b = to ? { x: to.x + to.width / 2, y: to.y + to.height / 2 } : world(e);
      const from = g.fromId ? st.els[g.fromId] : null;
      setDraft({ a: from ? { x: from.x + from.width / 2, y: from.y + from.height / 2 } : g.start, b });
    } else {
      const r = normRect(g.start, local(e));
      setMarquee(r);
      const tl = toWorld({ x: r.x, y: r.y }, st.camera);
      const wr = { x: tl.x, y: tl.y, width: r.width / st.camera.zoom, height: r.height / st.camera.zoom };
      const inside = Object.values(st.els).filter((x) => x.type !== "group" && intersects(rectOf(x, st.els), wr)).map((x) => x.id);
      st.select([...g.base, ...inside]);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pan.current = null; setPanning(false);
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    if (g?.kind === "connect") return e.type === "pointercancel" ? setDraft(null) : finishConnector(g, e);
    if (!g || g.kind === "marquee" || (g.kind === "move" && !g.moved)) return;
    const st = useEditor.getState();
    const ids = g.kind === "move" ? Object.keys(g.orig).filter((id) => !(st.els[id].type === "connector" && isBound(st.els[id]))) : [g.orig.id];
    const patches = Object.fromEntries(ids.map((id) => {
      const e = st.els[id];
      return [id, { x: e.x, y: e.y, width: e.width, height: e.height, ...(e.type === "connector" ? { content: e.content } : {}) }];
    }));
    const before = g.kind === "move" ? g.orig : { [g.orig.id]: g.orig };
    if (!st.apply(patches, "geometry", before)) {
      st.preview(before);
      toast(BOUNDARY_MESSAGE);
    }
  }

  /** Соединитель: от объекта к объекту — привязанный, иначе свободные концы */
  function finishConnector(g: Extract<Gesture, { kind: "connect" }>, e: React.PointerEvent) {
    setDraft(null);
    const st = useEditor.getState();
    const id = document.elementsFromPoint(e.clientX, e.clientY).map((n) => targetId(n)).find(Boolean) ?? null;
    const toId = id && id !== g.fromId && st.els[id] && st.els[id].type !== "connector" ? id : null;
    const end = world(e);
    if (!toId && Math.hypot(end.x - g.start.x, end.y - g.start.y) < 8) return;
    const a = g.fromId ? null : g.start, b = toId ? null : end;
    const pts = [a ?? g.start, b ?? end];
    const r = normRect(pts[0], pts[1]);
    create("connector", { x: r.x + r.width / 2, y: r.y + r.height / 2 }, {
      width: Math.max(1, r.width), height: Math.max(1, r.height),
      content: { fromId: g.fromId, toId, from: a ?? undefined, to: b ?? undefined },
      style: { stroke: "ink", arrow: "end" },
    });
    useUi.getState().setTool("select");
  }

  /** Двойной клик: по объекту — редактирование, по пустому месту — новая заметка */
  function onDoubleClick(e: React.MouseEvent) {
    const st = useEditor.getState();
    if (!st.canEdit) return;
    const id = targetId(e.target);
    if (id) return startEditing(id);
    const el = create("note", world(e));
    if (el) startEditing(el.id);
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const st = useEditor.getState();
    const ids = hit(e.target);
    if (ids && !ids.every((id) => st.selected.includes(id))) st.select(ids);
    if (!ids) st.select([]);
    setMenu({ x: e.clientX, y: e.clientY, items: contextItems(world(e)) });
  }

  /** Перетаскивание файлов: изображения — объекты, документы — источники в точке отпускания */
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropping(false);
    const files = [...e.dataTransfer.files];
    if (!files.length || !useEditor.getState().canEdit) return;
    const at = world(e);
    const images = files.filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type) && !e.shiftKey);
    const docs = files.filter((f) => !images.includes(f));
    if (images.length) insertImages(images, at);
    if (docs.length) insertSources(docs, { x: at.x, y: at.y + images.length * 40 });
  }

  return (
    <>
      <div
        ref={ref}
        tabIndex={0}
        className={`${s.viewport} ${panning ? s.panning : space ? s.spaceReady : tool !== "select" ? s.toolCursor : ""}`}
        style={backgroundStyle(background.type, background.spacing, camera)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropping(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
        onDrop={onDrop}
      >
        <div className={s.world} style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
          <div className={s.boundary} style={{ left: -bounds.hx, top: -bounds.hy, width: bounds.hx * 2, height: bounds.hy * 2 }} />
          {Object.values(els).map((el) => <ElementView key={el.id} el={el} />)}
          <ConnectorLayer draft={draft} />
        </div>
        <SelectionOverlay marquee={marquee} onHandleDown={onHandleDown} />
        {dropping && <div className={s.dropHint} />}
      </div>
      <PropsBar onMore={(x, y) => setMenu({ x, y, items: contextItems(world({ clientX: x, clientY: y })) })} />
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
      <ZoomBar view={view} />
      <BackgroundPicker />
    </>
  );
}
