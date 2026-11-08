"use client";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import s from "./board.module.css";

/** Popovers render inside the board root so they inherit the page theme tokens. */
export const LayerContext = createContext<HTMLElement | null>(null);

type Rect = { top: number; bottom: number; left: number; right: number };

/**
 * Floating layer: opens above its anchor (below only when there is no room), never takes layout
 * space, so the text under a formula or slash menu does not move.
 */
export function Popover({ anchor, rect, onClose, children, wide, label, role = "dialog" }: {
  anchor: HTMLElement | null; rect?: () => Rect; onClose(): void; children: ReactNode; wide?: boolean; label?: string; role?: string;
}) {
  const layer = useContext(LayerContext);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useLayoutEffect(() => {
    const place = () => {
      const p = ref.current;
      if (!p || !anchor) return;
      const r = rect ? rect() : anchor.getBoundingClientRect();
      const h = p.offsetHeight, w = p.offsetWidth;
      let top = r.top - h - 8, below = false;
      if (top < 8) { top = r.bottom + 8; below = true; }
      setPos({ top, below, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { ro.disconnect(); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [anchor, rect]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      closeRef.current();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); closeRef.current(); anchor?.focus(); } };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [anchor]);
  if (!layer) return null;
  return createPortal(<div ref={ref} role={role} aria-label={label} className={`${s.pop} ${wide ? s.popWide : ""}`} data-below={pos?.below || undefined}
    style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, opacity: pos ? undefined : 0 }}>{children}</div>, layer);
}

export type MenuItem = { section: string } | { label: string; ico?: string; hint?: string; danger?: boolean; run(): void };

/** List menu with a highlighted row; the owner drives arrows and Enter through the returned index. */
export function MenuList({ title, items, sel, onPick }: { title?: string; items: MenuItem[]; sel: number; onPick(i: number): void }) {
  const box = useRef<HTMLDivElement>(null);
  let n = -1;
  useEffect(() => { box.current?.querySelector("[data-sel]")?.scrollIntoView({ block: "nearest" }); }, [sel]);
  const actions = items.filter((x) => !("section" in x));
  return <div ref={box} className={s.menu} role="listbox">
    {title && <div className={s.menuH}>{title}</div>}
    {items.map((it, i) => {
      if ("section" in it) return <div key={`s${i}`} className={s.menuH}>{it.section}</div>;
      const idx = ++n;
      return <button key={i} type="button" role="option" aria-selected={idx === sel} data-sel={idx === sel || undefined} className={`${s.menuI} ${it.danger ? s.danger : ""}`}
        onPointerDown={(e) => e.preventDefault()} onClick={() => onPick(idx)}>
        {it.ico && <span className={s.ico}>{it.ico}</span>}<span>{it.label}</span>{it.hint && <small>{it.hint}</small>}
      </button>;
    })}
    {!actions.length && <div className={s.menuEmpty}>Ничего не нашлось</div>}
  </div>;
}

export const menuActions = (items: MenuItem[]) => items.filter((x): x is Exclude<MenuItem, { section: string }> => !("section" in x));

/** A self-contained click menu (widget ⋯ menu, widget gallery). */
export function Menu({ anchor, title, items, onClose, wide }: { anchor: HTMLElement | null; title?: string; items: MenuItem[]; onClose(): void; wide?: boolean }) {
  const [sel, setSel] = useState(0);
  const acts = menuActions(items);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((v) => (v + 1) % Math.max(1, acts.length)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((v) => (v - 1 + acts.length) % Math.max(1, acts.length)); }
      if (e.key === "Enter") { e.preventDefault(); const a = acts[sel]; onClose(); a?.run(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [acts, sel, onClose]);
  return <Popover anchor={anchor} onClose={onClose} wide={wide} role="presentation">
    <MenuList title={title} items={items} sel={sel} onPick={(i) => { onClose(); acts[i]?.run(); }} />
  </Popover>;
}
