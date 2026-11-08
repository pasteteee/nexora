"use client";
import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/lib/realtime";
import s from "./collab.module.css";

/**
 * Курсоры участников поверх документа. Координаты (договорённость с lib/realtime):
 * x — от центра колонки документа (страница центрирована, ширина окна у всех разная),
 * y — от начала прокручиваемого содержимого. Это временные данные, в БД не пишутся.
 */
export function PresenceCursors({ canvasId }: { canvasId: string }) {
  const { peers, moveCursor } = usePresence(canvasId);
  const anchor = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ width: 0, scroll: 0 });

  useEffect(() => {
    const host = anchor.current?.parentElement;
    if (!host) return;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    const scroller = () => [...host.querySelectorAll<HTMLElement>("*")].find((el) => {
      const o = getComputedStyle(el).overflowY;
      return (o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight;
    }) ?? null;
    let sc: HTMLElement | null = scroller();
    // Looking for the scroller walks the whole page: at most once a second, never on every pointer move.
    let lookedAt = performance.now();
    const current = () => {
      if (sc && host.contains(sc)) return sc;
      const t = performance.now();
      if (t - lookedAt > 1000) { lookedAt = t; sc = scroller(); }
      return sc && host.contains(sc) ? sc : null;
    };
    const measure = () => setView({ width: host.clientWidth, scroll: current()?.scrollTop ?? 0 });
    const onMove = (e: PointerEvent) => {
      const sc = current();
      const r = host.getBoundingClientRect();
      moveCursor({ x: Math.round(e.clientX - r.left - r.width / 2), y: Math.round(e.clientY - r.top + (sc?.scrollTop ?? 0)) });
    };
    const onLeave = () => moveCursor(null);
    const onScroll = () => { const top = current()?.scrollTop ?? 0; setView((v) => (v.scroll === top ? v : { ...v, scroll: top })); };
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    measure();
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("scroll", onScroll, true);
    return () => {
      ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("scroll", onScroll, true);
      moveCursor(null);
    };
  }, [moveCursor]);

  return <div ref={anchor} className={s.cursors} aria-hidden>
    {peers.filter((p) => p.cursor).map((p) => <div key={p.key} className={s.cursor}
      style={{ transform: `translate(${p.cursor!.x + view.width / 2}px, ${p.cursor!.y - view.scroll}px)` }}>
      <svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1l13 10.5-6 .6L4.6 19z" fill={p.color} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" /></svg>
      <span className={s.cursorName} style={{ background: p.color }}>{p.name}</span>
    </div>)}
  </div>;
}
