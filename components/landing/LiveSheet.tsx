"use client";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { NOTEBOOK_THEMES, type NotebookTheme } from "@/lib/types";
import s from "./landing.module.css";

export type SheetItem = { id: string; x: number; y: number; className?: string; label: string; children: ReactNode };

const STEP = 12;
const MIN_X = 72;
const MIN_Y = 80;
const snap = (v: number) => Math.round(v / STEP) * STEP;

/**
 * A notebook page from the editor, shrunk for the landing: the widgets can be dragged (mouse, touch, arrow keys)
 * and the paper switches between the seven notebook themes. On narrow screens the widgets stack and stay put.
 */
export function LiveSheet({ title, items, demo }: { title: string; items: SheetItem[]; demo?: string }) {
  const sheet = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<NotebookTheme>("clean");
  const [pos, setPos] = useState(() => Object.fromEntries(items.map((i) => [i.id, { x: i.x, y: i.y }])));
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; grab: boolean; show: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  const stopDemo = () => { timers.current.forEach(clearTimeout); timers.current = []; setGhost(null); };

  const stacked = () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
  const raise = (id: string) => setOrder((o) => [...o.filter((x) => x !== id), id]);

  // Once after load, a cursor picks up one widget and moves it, so visitors see the sheet is not a picture.
  useEffect(() => {
    if (!demo || window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 720px)").matches) return;
    const from = items.find((i) => i.id === demo);
    if (!from) return;
    const at = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
    const gx = from.x + 70, gy = from.y + 34, dx = 240, dy = 60;
    at(2600, () => setGhost({ x: gx + 120, y: gy + 140, grab: false, show: true }));
    at(2700, () => setGhost({ x: gx, y: gy, grab: false, show: true }));
    at(3700, () => { setGhost((g) => g && { ...g, grab: true }); setDragging(demo); raise(demo); });
    at(3900, () => { setGhost((g) => g && { ...g, x: gx + dx, y: gy + dy }); setPos((p) => ({ ...p, [demo]: { x: from.x + dx, y: from.y + dy } })); });
    at(4900, () => { setDragging(null); setGhost((g) => g && { ...g, grab: false }); });
    at(5300, () => setGhost((g) => g && { ...g, show: false }));
    at(5700, () => setGhost(null));
    const list = timers.current;
    return () => list.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickTheme = (t: NotebookTheme) => {
    const doc = document as Document & { startViewTransition?: (f: () => void) => unknown };
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setTheme(t);
    doc.startViewTransition(() => flushSync(() => setTheme(t)));
  };

  const clamp = (id: string, x: number, y: number, el: HTMLElement) => {
    const box = sheet.current;
    if (!box) return { x, y };
    return {
      x: Math.max(MIN_X, Math.min(box.clientWidth - el.offsetWidth - 8, x)),
      y: Math.max(MIN_Y, Math.min(box.clientHeight - el.offsetHeight - 8, y)),
    };
  };

  const onDown = (id: string) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || stacked()) return;
    e.preventDefault();
    stopDemo();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, ...pos[id] };
    setDragging(id);
    raise(id);
  };
  const onMove = (id: string) => (e: PointerEvent<HTMLDivElement>) => {
    const st = start.current;
    if (dragging !== id || !st) return;
    const next = clamp(id, st.x + e.clientX - st.px, st.y + e.clientY - st.py, e.currentTarget);
    setPos((p) => ({ ...p, [id]: next }));
  };
  const onUp = (id: string) => () => {
    if (dragging !== id) return;
    start.current = null;
    setDragging(null);
    setPos((p) => ({ ...p, [id]: { x: snap(p[id].x), y: snap(p[id].y) } }));
  };
  const onKey = (id: string) => (e: KeyboardEvent<HTMLDivElement>) => {
    const d = ({ ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] } as Record<string, number[]>)[e.key];
    if (!d || stacked()) return;
    e.preventDefault();
    const el = e.currentTarget;
    raise(id);
    setPos((p) => ({ ...p, [id]: clamp(id, p[id].x + d[0], p[id].y + d[1], el) }));
  };

  return (
    <div className={s.sheetBox}>
      <div ref={sheet} className={s.sheet} data-nb={theme === "clean" ? undefined : theme}>
        <span className={s.shDate} aria-hidden="true">8 нояб.</span>
        <p className={s.shTitle}>{title}</p>
        {items.map((it, i) => (
          <div
            key={it.id}
            role="group"
            tabIndex={0}
            aria-roledescription="перетаскиваемый блок"
            aria-label={`${it.label}. Стрелки двигают блок`}
            className={`${s.w} ${it.className ?? ""} ${dragging === it.id ? s.drag : ""} ${ghost && it.id === demo ? s.slow : ""}`}
            style={{ left: pos[it.id].x, top: pos[it.id].y, zIndex: order.indexOf(it.id) + 1, "--i": i } as CSSProperties}
            onPointerDown={onDown(it.id)}
            onPointerMove={onMove(it.id)}
            onPointerUp={onUp(it.id)}
            onPointerCancel={onUp(it.id)}
            onKeyDown={onKey(it.id)}
          >
            <span className={s.grip} aria-hidden="true">⠿</span>
            {it.children}
          </div>
        ))}
        {ghost && (
          <svg className={s.ghost} style={{ left: ghost.x, top: ghost.y, opacity: ghost.show ? 1 : 0 }} data-grab={ghost.grab || undefined} viewBox="0 0 24 24" aria-hidden="true">
            {ghost.grab
              ? <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11m0-1.5v-4a1.5 1.5 0 0 1 3 0V11m0-3a1.5 1.5 0 0 1 3 0v3m0-1a1.5 1.5 0 0 1 3 0v4.5a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L4.5 15a1.6 1.6 0 0 1 2.4-2.1L8 14" fill="var(--paper)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              : <path d="M5 3l14 7.5-6.2 1.6L10 18z" fill="var(--paper)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />}
          </svg>
        )}
      </div>
      <div className={s.themes} role="group" aria-label="Тема тетради">
        <span>Бумага:</span>
        {NOTEBOOK_THEMES.map(([t, name]) => (
          <button key={t} type="button" className={s.th} aria-pressed={t === theme} onClick={() => pickTheme(t)}>
            <i className={s[`sw-${t}`]} />{name}
          </button>
        ))}
      </div>
      <p className={s.hint}>Потяните любой блок на листе. Так же он двигается в редакторе.</p>
    </div>
  );
}
