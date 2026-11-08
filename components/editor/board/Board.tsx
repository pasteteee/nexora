"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useEditor } from "@/lib/editor/store";
import { makeElement, topZ } from "@/lib/editor/factory";
import { insertImages, insertSources, pickFiles } from "@/lib/editor/actions";
import { IMAGE_ACCEPT, SOURCE_ACCEPT } from "@/lib/data/upload-rules";
import { toast } from "@/components/ui";
import {
  CATALOG, CATALOG_BY_TYPE, COLS, DEFAULT_SPAN, GAP, MIN_SPAN, NARROW, TEXT_LIMIT,
  defaultData, linesOf, linesToMarkdown, pack, pageWidgets, sideSlot, summary, uid,
  type Layout, type Side, type Line, type NoteWidget, type Widget, type WidgetType,
} from "@/lib/editor/board/model";
import type { CanvasElement, NotebookTheme } from "@/lib/types";
import { BoardContext, useBoard as useContextApi, type BoardApi, type FocusRequest } from "./context";
import { LayerContext, Menu, Popover, type MenuItem } from "./Popover";
import { WIDGETS } from "./Widgets";
import s from "./board.module.css";

type Drag = { id: string | null; type: WidgetType; span: number; h: number; col: number; y: number; left: number; top: number; keys: Record<string, number>; side: Side | null };
type Placed = { id: string; col: number; span: number; key: number; h: number; top: number };

const nextKey = (ws: Widget[], key: number) => ws.reduce((m, w) => (w.layout.key > key && w.layout.key < m ? w.layout.key : m), Infinity);
const between = (a: number, b: number, k = 1, n = 2) => (Number.isFinite(b) ? a + ((b - a) * k) / n : a + k);
const sameLayout = (a: Layout, b: Layout) => a.col === b.col && a.span === b.span && Math.abs(a.key - b.key) < 0.01 && JSON.stringify(a.beside ?? null) === JSON.stringify(b.beside ?? null);
const plain = ({ beside: _b, ...l }: Layout): Layout => { void _b; return l; };

function scrollParent(n: HTMLElement | null): HTMLElement | null {
  for (let p = n?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * Placement fields of a widget. `documentOrder` mirrors the packing key: the public page and
 * exports read it (the published projection exposes it, not `layout`), so they keep page order.
 */
const placement = (layout: Layout) => ({ layout, documentOrder: layout.key });

/** Element for a new widget. Placement is written in the same step. */
function newElement(type: WidgetType, canvasId: string, z: number, layout: Layout, text = ""): CanvasElement {
  const at = { x: 0, y: 0 };
  if (type === "text") {
    const lines: Line[] = [{ id: uid(), t: "p", text }];
    return makeElement("text", at, canvasId, z, { content: { text, lines, ...placement(layout) } });
  }
  if (type === "formula") return makeElement("formula", at, canvasId, z, { content: { src: "", latex: "", ...placement(layout) } });
  if (type === "note") return makeElement("note", at, canvasId, z, { content: { text: "", ...placement(layout) }, style: { color: "yellow", fontSize: 16 } });
  const t = type as NoteWidget, data = defaultData(t);
  return makeElement("note", at, canvasId, z, { content: { widget: t, data, text: summary(t, data), ...placement(layout) }, style: { color: "gray", fontSize: 16 } });
}

/**
 * Page of widgets. Any widget is dragged anywhere by the handle on its floating bar; the others
 * reflow around it (packing with gravity). The right edge changes width in 1/24 steps.
 * Menus and editors float above the content, so the text never shifts.
 */
export function Board({ header, tools, theme = "clean", onOpenMaterials }: { header?: ReactNode; tools?: ReactNode; theme?: NotebookTheme; onOpenMaterials?(): void }) {
  const els = useEditor((st) => st.els), canEdit = useEditor((st) => st.canEdit);
  const widgets = useMemo(() => pageWidgets(els), [els]);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const ro = useRef<ResizeObserver | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [resize, setResize] = useState<{ id: string; span: number; x: number; y: number } | null>(null);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const [gallery, setGallery] = useState<HTMLElement | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const pending = useRef<FocusRequest | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const placedRef = useRef<Placed[]>([]);

  // Widget heights drive the packing; a resize observer keeps them current.
  useEffect(() => {
    const c = canvas.current;
    const cw = new ResizeObserver(() => setWidth(c?.clientWidth ?? 0));
    if (c) { cw.observe(c); setWidth(c.clientWidth); }
    // A disconnected observer can observe again, so a StrictMode remount keeps measuring.
    return () => { cw.disconnect(); ro.current?.disconnect(); };
  }, []);
  // Ref callbacks run before effects, so widgets present on first render were never
  // observed: their heights stayed at the 60px default and they overlapped after a reload.
  // Create the observer on first use instead.
  const observer = () => ro.current ??= new ResizeObserver((entries) => {
    setHeights((cur) => {
      let next = cur;
      for (const e of entries) {
        const n = e.target as HTMLElement, id = n.dataset.wid;
        if (id && cur[id] !== n.offsetHeight) { if (next === cur) next = { ...cur }; next[id] = n.offsetHeight; }
      }
      return next;
    });
  });
  const measure = useCallback((n: HTMLElement | null) => {
    if (!n) return;
    const obs = observer();
    obs.observe(n);
    return () => { obs.unobserve(n); };
  }, []);

  // Undo/redo for widget operations. Listening on window keeps Ctrl+Z working right after
  // a drag or a widget-menu action, when focus has fallen back to <body>.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || !(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("textarea,input,select,[contenteditable]:not([contenteditable=false]),[role=dialog],[role=menu],[role=listbox]")) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      e.preventDefault();
      const editor = useEditor.getState();
      if (key === "y" || e.shiftKey) editor.redo(); else editor.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit]);

  const narrow = width > 0 && width < NARROW;
  const stepX = (width - GAP * (COLS - 1)) / COLS + GAP, cellW = stepX - GAP;
  const box = (col: number, span: number) => narrow ? { left: 0, width } : { left: col * stepX, width: span * cellW + (span - 1) * GAP };
  const layoutOf = (w: Widget): Layout => resize?.id === w.id ? { ...w.layout, span: resize.span } : w.layout;

  const placeAll = (d: Drag | null): Placed[] => {
    const items = widgets.filter((w) => w.id !== d?.id).map((w) => {
      const l = layoutOf(w);
      const sd = d?.side?.id === w.id ? d.side : null;
      return { id: w.id, col: narrow ? 0 : sd ? sd.tcol : l.col, span: narrow ? COLS : sd ? sd.tspan : l.span, key: d ? d.keys[w.id] ?? l.key : l.key, h: heights[w.id] ?? 60 };
    });
    if (d) {
      const sd = d.side, key = sd ? (d.keys[sd.id] ?? 0) + (sd.left ? -0.25 : 0.25) : d.y;
      items.push({ id: "__ph", col: narrow ? 0 : sd ? sd.col : d.col, span: narrow ? COLS : sd ? sd.span : d.span, key, h: d.h });
    }
    return pack(items);
  };
  const placed = placeAll(drag);
  const tops = Object.fromEntries(placed.map((p) => [p.id, p.top]));
  const bottom = placed.reduce((m, p) => Math.max(m, p.top + p.h), 0);
  useLayoutEffect(() => { if (!drag) placedRef.current = placed; });

  /* ---------- focus requests, applied once the target is on the page ---------- */
  useLayoutEffect(() => {
    const r = pending.current, host = canvas.current?.querySelector<HTMLElement>(`[data-wid="${CSS.escape(r?.id ?? "")}"]`);
    if (!r || !host) return;
    const t = r.lid ? host.querySelector<HTMLElement>(`[data-lid="${CSS.escape(r.lid)}"]`) : host.querySelector<HTMLElement>("textarea:not([readonly]), input:not([type=checkbox]):not([readonly]), [data-math]");
    if (!t) return;
    pending.current = null;
    if (t.dataset.math !== undefined) { t.focus(); if (r.open) t.click(); }
    else if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) {
      t.focus({ preventScroll: true });
      const len = t.value.length, at = r.at === "start" ? 0 : typeof r.at === "number" ? Math.min(r.at, len) : len;
      try { t.setSelectionRange(at, at); } catch { /* inputs without selection */ }
    } else t.focus({ preventScroll: true });
    const rc = t.getBoundingClientRect();
    if (rc.top < 80 || rc.bottom > window.innerHeight - 20) t.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  /* ---------- store helpers ---------- */
  const st = () => useEditor.getState();
  const writeLayouts = (patches: Record<string, Layout>, add: CanvasElement[] = []) => {
    const cur = st().els, patch: Record<string, Partial<CanvasElement>> = {};
    for (const [id, l] of Object.entries(patches)) if (cur[id]) patch[id] = { content: { ...cur[id].content, ...placement(l) } };
    if (Object.keys(patch).length || add.length) st().batch({ add, patch });
  };
  const notify = useCallback((id: string, message: string) => {
    setNotices((n) => ({ ...n, [id]: message }));
    setTimeout(() => setNotices((n) => { if (n[id] !== message) return n; const c = { ...n }; delete c[id]; return c; }), 3200);
  }, []);

  /** A widget placed beside another moves away or is deleted: it gets its own width back, the other one too if nothing is in the way. */
  const release = (w: Widget, lay: Record<string, Layout>) => {
    const b = w.layout.beside;
    if (!b) return;
    lay[w.id] = { ...plain(lay[w.id] ?? w.layout), span: b.own };
    const t = lay[b.id] ?? widgets.find((x) => x.id === b.id)?.layout;
    const tp = placedRef.current.find((p) => p.id === b.id);
    if (!t || !tp) return;
    const blocked = placedRef.current.some((o) => o.id !== w.id && o.id !== b.id
      && o.top < tp.top + tp.h && tp.top < o.top + o.h && o.col < b.col + b.span && b.col < o.col + o.span);
    if (!blocked) lay[b.id] = { ...t, col: b.col, span: b.span };
  };

  const api: BoardApi = {
    edit: canEdit,
    setContent(id, patch) { const cur = st().els[id]; if (cur && st().canEdit) st().apply({ [id]: { content: { ...cur.content, ...patch } } }, "text"); },
    setStyle(id, patch) { const cur = st().els[id]; if (cur && st().canEdit) st().apply({ [id]: { style: { ...cur.style, ...patch } } }, "text"); },
    setData(w, t, data) { api.setContent(w.id, { widget: t, data, text: summary(t, data) }); },
    setLines(w, lines) {
      const total = lines.reduce((n, l) => n + (l.text ?? l.src ?? "").length, 0);
      if (total > TEXT_LIMIT && total > linesOf(w.el).reduce((n, l) => n + (l.text ?? l.src ?? "").length, 0)) { notify(w.id, "В одном тексте до 20 000 знаков. Продолжите в новом тексте ниже"); return; }
      api.setContent(w.id, { lines, text: linesToMarkdown(lines) });
    },
    remove(id) {
      if (!st().canEdit) return;
      const w = widgets.find((x) => x.id === id), lay: Record<string, Layout> = {};
      if (w?.layout.beside) release(w, lay);
      const cur = st().els, patch: Record<string, Partial<CanvasElement>> = {};
      for (const [k, l] of Object.entries(lay)) if (k !== id && cur[k]) patch[k] = { content: { ...cur[k].content, ...placement(l) } };
      st().batch({ remove: [id], patch });
    },
    add(type, after) {
      const state = st();
      if (!state.canEdit || !state.canvasId) return;
      if (type === "image") { void pickFiles(IMAGE_ACCEPT).then((f) => { if (f.length) void insertImages(f, { x: 0, y: 0 }); }); return; }
      if (type === "source") { void pickFiles(SOURCE_ACCEPT).then((f) => { if (f.length) void insertSources(f, { x: 0, y: 0 }); }); return; }
      if (type === "fragment") { onOpenMaterials?.(); toast("Найдите фрагмент в «Материалах и ИИ» и вставьте его на страницу"); return; }
      const span = DEFAULT_SPAN[type];
      const maxKey = widgets.reduce((m, w) => Math.max(m, w.layout.key), 0);
      const layout: Layout = after
        ? { col: Math.min(after.layout.col, COLS - span), span, key: between(after.layout.key, nextKey(widgets, after.layout.key)) }
        : { col: 0, span, key: maxKey + 1 };
      const el = newElement(type, state.canvasId, topZ(state.els), layout);
      // Widgets placed implicitly (older pages) get their placement in the same history step.
      const implicit = Object.fromEntries(widgets.filter((w) => !w.el.content.layout).map((w) => [w.id, w.layout]));
      writeLayouts(implicit, [el]);
      api.focus({ id: el.id, open: type === "formula" });
    },
    insertAtLine(w, i, type) {
      const state = st(), lines = linesOf(w.el), before = lines.slice(0, i), after = lines.slice(i + 1);
      if (!state.canvasId) return;
      if (type === "image" || type === "source" || type === "fragment") {
        api.setLines(w, lines.map((l, k) => k === i ? { ...l, text: "" } : l));
        api.add(type, w); return;
      }
      const next = nextKey(widgets, w.layout.key), span = Math.min(DEFAULT_SPAN[type], COLS - w.layout.col);
      const el = newElement(type, state.canvasId, topZ(state.els), { col: w.layout.col, span: Math.max(MIN_SPAN, span), key: between(w.layout.key, next, 1, 3) });
      const add = [el];
      if (after.length) {
        const rest = newElement("text", state.canvasId, topZ(state.els) + 1, { col: w.layout.col, span: w.layout.span, key: between(w.layout.key, next, 2, 3) });
        rest.content = { ...rest.content, lines: after, text: linesToMarkdown(after) };
        add.push(rest);
      }
      const cur = state.els[w.id];
      state.batch({
        add,
        patch: before.length ? { [w.id]: { content: { ...cur.content, ...placement(w.layout), lines: before, text: linesToMarkdown(before) } } } : {},
        remove: before.length ? [] : [w.id],
      });
      api.focus({ id: el.id, open: type === "formula" });
    },
    focus(req) { pending.current = req; setFocusTick((n) => n + 1); },
    ordered() { return [...placedRef.current].sort((a, b) => a.top - b.top || a.col - b.col).map((p) => widgets.find((w) => w.id === p.id)).filter((w): w is Widget => !!w); },
    notify,
  };
  void focusTick;

  /* ---------- writing at the end of the page ---------- */
  function writeAtEnd() {
    const state = st();
    if (!state.canEdit || !state.canvasId) return;
    let last: Placed | null = null;
    for (const p of placedRef.current) if (!last || p.top + p.h > last.top + last.h + 1 || (Math.abs(p.top + p.h - last.top - last.h) <= 1 && p.span > last.span)) last = p;
    const lw = last && widgets.find((w) => w.id === last!.id);
    if (lw && lw.type === "text" && lw.layout.span >= COLS / 2) {
      const lines = linesOf(lw.el), tail = lines[lines.length - 1];
      if (tail && tail.t === "p" && !tail.text) { api.focus({ id: lw.id, lid: tail.id }); return; }
      const ln: Line = { id: uid(), t: "p", text: "" };
      api.setLines(lw, [...lines, ln]);
      api.focus({ id: lw.id, lid: ln.id });
      return;
    }
    api.add("text");
  }

  /** Slot beside the widget under the pointer, when the pointer is in its left or right third and there is no room there. */
  function sideAt(ev: PointerEvent, cr: DOMRect, w: Widget | null, span: number): Side | null {
    for (const o of widgets) {
      if (o.id === w?.id) continue;
      const node = canvas.current?.querySelector<HTMLElement>(`[data-wid="${CSS.escape(o.id)}"]`);
      if (!node) continue;
      // Columns as they would be without this widget beside them, so the slot does not flicker while the target narrows.
      const own = w?.layout.beside?.id === o.id ? w.layout.beside : null;
      const lo = own ? { id: o.id, col: own.col, span: own.span } : { id: o.id, col: o.layout.col, span: o.layout.span };
      const b = box(lo.col, lo.span), r = node.getBoundingClientRect(), x0 = cr.left + b.left;
      if (ev.clientX < x0 - 24 || ev.clientX > x0 + b.width + 24 || ev.clientY < r.top || ev.clientY > r.bottom) continue;
      return sideSlot(lo, span, (ev.clientX - x0) / b.width);
    }
    return null;
  }

  /* ---------- drag anywhere, live reflow ---------- */
  function startDrag(e: React.PointerEvent, w: Widget | null, type: WidgetType = w?.type ?? "text", onTap?: () => void) {
    if (e.button !== 0 || !canEdit) return;
    e.preventDefault();
    const c = canvas.current!, sx = e.clientX, sy = e.clientY;
    const node = w ? c.querySelector<HTMLElement>(`[data-wid="${CSS.escape(w.id)}"]`) : null;
    const er = node?.getBoundingClientRect();
    const ox = er ? sx - er.left : 40, oy = er ? sy - er.top : 16;
    const span = w ? w.layout.beside?.own ?? w.layout.span : DEFAULT_SPAN[type];
    const scroller = scrollParent(c);
    let cur: Drag | null = null, started = !w;
    const begin = () => {
      const keys = Object.fromEntries(placedRef.current.map((p) => [p.id, p.top]));
      cur = { id: w?.id ?? null, type, span, h: node?.offsetHeight ?? 120, col: w?.layout.col ?? 0, y: w ? keys[w.id] ?? 0 : 1e9, left: 0, top: 0, keys, side: null };
      document.body.setAttribute("data-bd-dragging", "");
    };
    if (started) begin();
    const move = (ev: PointerEvent) => {
      if (!started) { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return; started = true; begin(); }
      const cr = c.getBoundingClientRect(), left = ev.clientX - cr.left - ox, top = ev.clientY - cr.top - oy;
      const side = narrow ? null : sideAt(ev, cr, w, span);
      cur = { ...cur!, left, top, col: narrow ? cur!.col : Math.max(0, Math.min(COLS - span, Math.round(left / stepX))), y: top - 1, side };
      setDrag(cur);
      const vh = window.innerHeight;
      if (ev.clientY > vh - 60) (scroller ?? window).scrollBy(0, 14); else if (ev.clientY < 60) (scroller ?? window).scrollBy(0, -14);
    };
    const up = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      document.body.removeAttribute("data-bd-dragging");
      const d = cur; setDrag(null);
      if (!started || !d) { if (!started) onTap?.(); return; }
      if (!w) {
        const cr = c.getBoundingClientRect();
        if (ev.clientY < cr.top - 80 || ev.clientX < cr.left - 120 || ev.clientX > cr.right + 120) return;
      }
      // Fix the result: every widget keeps the top it has now, the dropped one sits just above its slot.
      const final = placeAll(d), ph = final.find((p) => p.id === "__ph")!;
      const lay: Record<string, Layout> = {};
      for (const p of final) if (p.id !== "__ph") lay[p.id] = { ...widgets.find((x) => x.id === p.id)!.layout, key: p.top };
      if (w) release(w, lay);
      let l: Layout = { col: d.col, span: d.span, key: ph.top - 0.5 };
      const t = d.side && lay[d.side.id];
      if (d.side && t) {
        const sd = d.side;
        l = { col: sd.col, span: sd.span, key: t.key + (sd.left ? -0.25 : 0.25), beside: { id: sd.id, col: t.col, span: t.span, own: d.span } };
        lay[sd.id] = { ...t, col: sd.tcol, span: sd.tspan };
      }
      const patches: Record<string, Layout> = {};
      for (const [id, nl] of Object.entries(lay)) {
        const wd = widgets.find((x) => x.id === id)!;
        if (id !== w?.id && (!wd.el.content.layout || !sameLayout(nl, wd.layout))) patches[id] = nl;
      }
      if (w) { patches[w.id] = l; writeLayouts(patches); setDropped(w.id); setTimeout(() => setDropped(null), 500); return; }
      if (type === "image" || type === "source" || type === "fragment") { writeLayouts(patches); api.add(type); return; }
      const state = st();
      if (!state.canvasId) return;
      const el = newElement(type, state.canvasId, topZ(state.els), l);
      writeLayouts(patches, [el]);
      api.focus({ id: el.id, open: type === "formula" });
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  function keyMove(e: React.KeyboardEvent, w: Widget) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const l = { ...w.layout };
    if (e.key === "ArrowLeft") l.col = Math.max(0, l.col - 1);
    if (e.key === "ArrowRight") l.col = Math.min(COLS - l.span, l.col + 1);
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const others = widgets.filter((o) => o.id !== w.id && o.layout.col < l.col + l.span && l.col < o.layout.col + o.layout.span).sort((a, b) => a.layout.key - b.layout.key);
      if (e.key === "ArrowUp") { const prev = others.filter((o) => o.layout.key < l.key).pop(); if (!prev) return; const pp = others.filter((o) => o.layout.key < prev.layout.key).pop(); l.key = pp ? (pp.layout.key + prev.layout.key) / 2 : prev.layout.key - 1; }
      else { const nx = others.find((o) => o.layout.key > l.key); if (!nx) return; const nn = others.find((o) => o.layout.key > nx.layout.key); l.key = nn ? (nx.layout.key + nn.layout.key) / 2 : nx.layout.key + 1; }
    }
    writeLayouts({ ...Object.fromEntries(widgets.filter((x) => !x.el.content.layout).map((x) => [x.id, x.layout])), [w.id]: l });
    requestAnimationFrame(() => canvas.current?.querySelector<HTMLElement>(`[data-wid="${CSS.escape(w.id)}"] [data-handle]`)?.focus());
  }
  function startResize(e: React.PointerEvent, w: Widget) {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, span0 = w.layout.span;
    let span = span0;
    document.body.setAttribute("data-bd-resizing", "");
    const move = (ev: PointerEvent) => {
      span = Math.max(MIN_SPAN, Math.min(COLS - w.layout.col, span0 + Math.round((ev.clientX - sx) / stepX)));
      setResize({ id: w.id, span, x: ev.clientX, y: ev.clientY });
    };
    const up = () => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      document.body.removeAttribute("data-bd-resizing");
      setResize(null);
      if (span !== span0) writeLayouts({ [w.id]: { ...plain(w.layout), span } });
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  const setSpan = (w: Widget, span: number) => writeLayouts({ [w.id]: { ...plain(w.layout), span, col: Math.min(w.layout.col, COLS - span) } });
  const duplicate = (w: Widget) => {
    const state = st(); if (!state.canvasId) return;
    const copy: CanvasElement = { ...structuredClone(w.el), id: crypto.randomUUID(), zIndex: topZ(state.els), updatedAt: new Date().toISOString() };
    if (Array.isArray(copy.content.lines)) copy.content.lines = (copy.content.lines as Line[]).map((l) => ({ ...l, id: uid() }));
    copy.content.layout = { ...plain(w.layout), key: between(w.layout.key, nextKey(widgets, w.layout.key)) };
    writeLayouts({}, [copy]);
  };

  const galleryItems = CATALOG.map((c) => ({ ...c }));
  const focusedWidget = () => {
    const id = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-wid]")?.dataset.wid;
    return widgets.find((w) => w.id === id) ?? null;
  };

  return <BoardContext.Provider value={api}><LayerContext.Provider value={layer}>
    <div ref={setLayer} className={s.bd} data-nb={theme === "clean" ? undefined : theme}>
      <div className={s.inner}>
      {header}
      <div className={s.meta}>
        {canEdit ? <><span>Тяните <kbd>⋮⋮</kbd> слева от виджета в любое место, остальные подвинутся</span>
          <span><kbd>/</kbd> в тексте открывает блоки и виджеты</span></> : <span>Только просмотр</span>}
        <span className={s.metaTools}>{tools}
          {canEdit && <button type="button" className={s.btnPrimary} aria-haspopup="dialog" onClick={(e) => setGallery(e.currentTarget)}>+ Виджет</button>}</span>
      </div>
      <div ref={canvas} className={s.canvas} style={{ height: bottom + 24 }}>
        {drag && <div className={s.ph} style={{ ...box(drag.col, drag.span), top: tops.__ph, height: drag.h }} />}
        {widgets.map((w) => {
          const l = layoutOf(w), b = box(l.col, l.span), dragging = drag?.id === w.id;
          return <Frame key={w.id} w={w} measure={measure} dragging={dragging} dropped={dropped === w.id} notice={notices[w.id]}
            style={dragging ? { left: drag!.left, top: drag!.top, width: b.width } : { left: b.left, top: tops[w.id] ?? 0, width: b.width }}
            onHandle={(e, open) => startDrag(e, w, w.type, open)} onHandleKey={(e) => keyMove(e, w)} onResize={narrow ? undefined : (e) => startResize(e, w)}
            menu={[
              { section: "Ширина" },
              { label: "На всю ширину", ico: "▭", hint: l.span === COLS ? "сейчас" : undefined, run: () => setSpan(w, COLS) },
              { label: "Половина", ico: "◧", hint: l.span === 12 ? "сейчас" : undefined, run: () => setSpan(w, 12) },
              { label: "Треть", ico: "◫", hint: l.span === 8 ? "сейчас" : undefined, run: () => setSpan(w, 8) },
              { section: "Действия" },
              { label: "Дублировать", ico: "⧉", run: () => duplicate(w) },
              { label: "Удалить", ico: "×", danger: true, run: () => api.remove(w.id) },
            ]} />;
        })}
        {drag && !drag.id && <div className={s.ghost} style={{ left: drag.left, top: drag.top, width: box(0, drag.span).width }}>{CATALOG_BY_TYPE[drag.type]?.name}</div>}
      </div>
      {canEdit && <div className={s.end} data-empty={!widgets.length || undefined} tabIndex={0} role="button" aria-label="Продолжить писать в конце страницы"
        onClick={() => writeAtEnd()}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); writeAtEnd(); }
          // The typed character lands in the line that receives focus synchronously.
          else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) flushSync(() => writeAtEnd());
        }}>
        <span>{widgets.length ? "Нажмите здесь и пишите дальше." : "Нажмите здесь и начните писать."} <kbd>/</kbd> добавит виджет</span>
      </div>}
      {!canEdit && !widgets.length && <p className={s.empty}>На этой странице пока ничего нет</p>}
      </div>
      {resize && <div className={s.tip} style={{ left: resize.x + 14, top: resize.y - 30 }}>{resize.span === COLS ? "на всю ширину" : `${Math.round(resize.span / COLS * 100)} % ширины`}</div>}
      {gallery && <Popover anchor={gallery} onClose={() => setGallery(null)} label="Виджеты" wide>
        <div className={s.tiles}>
          <div className={s.tilesH}>Нажмите, чтобы добавить, или перетащите на нужное место</div>
          {[...new Set(galleryItems.map((c) => c.g))].map((g) => <div key={g} className={s.tileGroup}>
            <div className={s.tilesG}>{g}</div>
            {galleryItems.filter((c) => c.g === g).map((c) => <GalleryTile key={c.t} name={c.name} ico={c.ico} about={c.about}
              onPick={() => { const after = focusedWidget(); setGallery(null); api.add(c.t, after); }}
              onDragOut={(e) => { setGallery(null); startDrag(e, null, c.t); }} />)}
          </div>)}
        </div>
      </Popover>}
    </div>
  </LayerContext.Provider></BoardContext.Provider>;
}

function GalleryTile({ name, ico, about, onPick, onDragOut }: { name: string; ico: string; about: string; onPick(): void; onDragOut(e: React.PointerEvent): void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return <button type="button" className={s.tile}
    onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; }}
    onPointerMove={(e) => { const p = start.current; if (p && Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 6) { start.current = null; onDragOut(e); } }}
    onPointerUp={() => { start.current = null; }}
    onClick={onPick}>
    <span className={s.ico}>{ico}</span><span><b>{name}</b><small>{about}</small></span>
  </button>;
}

function Frame({ w, style, measure, dragging, dropped, notice, onHandle, onHandleKey, onResize, menu }: {
  w: Widget; style: React.CSSProperties; measure(n: HTMLElement | null): void | (() => void); dragging: boolean; dropped: boolean; notice?: string;
  onHandle(e: React.PointerEvent, open: () => void): void; onHandleKey(e: React.KeyboardEvent): void; onResize?(e: React.PointerEvent): void; menu: MenuItem[];
}) {
  const api = useContextApi();
  const [form, setForm] = useState<string | null>(null);
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  const [more, setMore] = useState<HTMLElement | null>(null);
  const def = WIDGETS[w.type];
  const name = CATALOG_BY_TYPE[w.type]?.name ?? "Виджет";
  const actions = api.edit && def.actions ? def.actions(w, api, (f) => setForm(f || null), form) : [];
  const tone = w.type === "callout" ? (w.el.content.data as { tone?: string } | undefined)?.tone ?? "info" : undefined;
  const color = w.type === "note" ? String(w.el.style.color ?? "yellow") : undefined;
  const ref = useCallback((n: HTMLElement | null) => { setFrame(n); return measure(n) ?? undefined; }, [measure]);
  return <section ref={ref} data-wid={w.id} data-type={w.type} data-tone={tone} data-color={color} data-card={def.card || undefined}
    data-dragging={dragging || undefined} data-dropped={dropped || undefined} data-edit={api.edit || undefined}
    className={s.w} style={style} aria-label={name}>
    {/* Gutter handle on the left: drag it to move the widget, press it for the widget menu. */}
    {api.edit && <button type="button" className={s.handle} data-handle title="Тяните, чтобы переставить. Нажмите, чтобы открыть меню"
      aria-label={`Переместить или изменить виджет «${name}»`} aria-haspopup="menu" aria-expanded={!!more}
      onPointerDown={(e) => { const n = e.currentTarget; onHandle(e, () => setMore(n)); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMore(e.currentTarget); } else onHandleKey(e); }}>
      <svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4" /><circle cx="7.5" cy="3" r="1.4" /><circle cx="2.5" cy="8" r="1.4" /><circle cx="7.5" cy="8" r="1.4" /><circle cx="2.5" cy="13" r="1.4" /><circle cx="7.5" cy="13" r="1.4" /></svg>
    </button>}
    {/* Pill with the widget's own actions; none, no pill. */}
    {actions.length > 0 && <div className={s.bar}>
      {actions.map((a) => a.swatch
        ? <button key={a.label} type="button" className={s.sw} data-color={a.swatch} aria-pressed={a.on} title={a.title} aria-label={a.title ?? a.label} onPointerDown={(e) => e.preventDefault()} onClick={a.run} />
        : <button key={a.label} type="button" aria-pressed={a.on} title={a.title} onPointerDown={(e) => e.preventDefault()} onClick={a.run}>{a.label}</button>)}
    </div>}
    <div className={s.body}><def.View w={w} form={form} setForm={setForm} frame={frame} /></div>
    {api.edit && onResize && <div className={s.rz} title="Потяните, чтобы изменить ширину" onPointerDown={onResize} />}
    {notice && <div className={s.notice} role="status">{notice}</div>}
    {more && <Menu anchor={more} title={name} items={menu} onClose={() => setMore(null)} />}
  </section>;
}
