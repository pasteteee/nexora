"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Maximize2, Minus, Plus } from "lucide-react";
import { Markdown } from "@/components/editor/elements/Markdown";
import { fillOf, strokeOf } from "@/lib/editor/styles";
import type { PublicBlock, PublicPage } from "@/lib/publish/projection";
import s from "./public.module.css";

export const MIN_ZOOM = 0.5, MAX_ZOOM = 3;
export const clampZoom = (z: number) => Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 100) / 100;

function FormulaView({ latex, style }: { latex: string; style: CSSProperties }) {
  const out = useMemo(() => {
    try { return { html: katex.renderToString(latex || "\\square", { throwOnError: true, displayMode: true, trust: false, maxExpand: 500 }) }; }
    catch { return null; }
  }, [latex]);
  return out ? <div className={s.formula} style={style} dangerouslySetInnerHTML={{ __html: out.html }} />
    : <pre className={s.formulaError} style={style}>{latex}</pre>;
}

function Block({ block }: { block: PublicBlock }) {
  const st = block.style;
  const base: CSSProperties = { color: st.color && /^(#|rgb|hsl|var\()/.test(st.color) ? st.color : undefined,
    fontSize: st.fontSize, fontWeight: st.fontWeight, textAlign: st.align, opacity: st.opacity };
  if (block.kind === "formula") return <FormulaView latex={block.latex} style={base} />;
  if (block.kind === "shape") return <div className={s.shape} data-shape={block.shape}
    style={{ ...base, textAlign: st.align ?? "center", background: fillOf(st.fill ?? "blue"), borderColor: strokeOf(st.stroke) }}>
    <Markdown text={block.text} /></div>;
  return <div className={block.note ? s.note : s.text} style={block.note ? { ...base, background: fillOf(st.fill) } : base}><Markdown text={block.text} /></div>;
}

/**
 * Read-only public page. The viewer box is the only scroll container: pan by scrolling, dragging
 * or one-finger swipe; zoom with the buttons, Ctrl/⌘ + wheel or pinch. The page itself never
 * scrolls horizontally (ТЗ 4.1.6), even when zoomed in.
 */
export function PublicViewer({ page }: { page: PublicPage }) {
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);

  const zoomTo = useCallback((next: number, cx?: number, cy?: number) => {
    const el = box.current, prev = zoomRef.current, z = clampZoom(next);
    if (!el || z === prev) return;
    const rect = el.getBoundingClientRect();
    const px = cx ?? rect.width / 2, py = cy ?? rect.height / 2;
    // Keep the point under the cursor/fingers in place.
    const wx = (el.scrollLeft + px) / prev, wy = (el.scrollTop + py) / prev;
    zoomRef.current = z;
    setZoom(z);
    requestAnimationFrame(() => { el.scrollLeft = wx * z - px; el.scrollTop = wy * z - py; });
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top);
    };
    let pinch: { d: number; z: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 2) pinch = { d: dist(e.touches), z: zoomRef.current }; };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      zoomTo(pinch.z * dist(e.touches) / pinch.d, cx, cy);
    };
    const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [zoomTo]);

  // Mouse drag-to-pan (touch already pans natively).
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || (e.target as HTMLElement).closest("a,button")) return;
    const el = e.currentTarget;
    drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) {
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.dataset.panning = "true";
      window.getSelection()?.removeAllRanges();
    }
    e.currentTarget.scrollLeft = d.l - (e.clientX - d.x);
    e.currentTarget.scrollTop = d.t - (e.clientY - d.y);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => { drag.current = null; delete e.currentTarget.dataset.panning; };

  return <main className={s.viewer}>
    <header className={s.header}>
      <Link href="/" className={s.brand} aria-label="Nexora — на главную">Nexora<span /></Link>
      <h1 className={s.title} title={page.name}>{page.name}</h1>
      <span className={s.badge}>Только просмотр</span>
    </header>
    <div ref={box} className={s.box} data-bg={page.backgroundType} tabIndex={0} aria-label={`Страница «${page.name}»`}
      style={{ "--spacing": `${page.backgroundSpacing * zoom}px` } as CSSProperties}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
      onKeyDown={(e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomTo(zoom * 1.25); }
        else if (e.key === "-") { e.preventDefault(); zoomTo(zoom / 1.25); }
        else if (e.key === "0") { e.preventDefault(); zoomTo(1); }
      }}>
      <article className={s.page} style={{ zoom }}>
        {page.blocks.length ? page.blocks.map((b) => <section key={b.id} className={s.block}><Block block={b} /></section>)
          : <p className={s.empty}>На этой странице пока ничего нет</p>}
      </article>
    </div>
    <div className={s.zoomBar} role="group" aria-label="Масштаб">
      <button onClick={() => zoomTo(zoom / 1.25)} disabled={zoom <= MIN_ZOOM} aria-label="Уменьшить"><Minus size={16} /></button>
      <button className={s.zoomValue} onClick={() => zoomTo(1)} aria-label="Сбросить масштаб" title="Сбросить масштаб">{Math.round(zoom * 100)}%</button>
      <button onClick={() => zoomTo(zoom * 1.25)} disabled={zoom >= MAX_ZOOM} aria-label="Увеличить"><Plus size={16} /></button>
      <button onClick={() => { zoomTo(1); box.current?.scrollTo({ left: 0, top: 0 }); }} aria-label="К началу страницы" title="К началу страницы"><Maximize2 size={15} /></button>
    </div>
  </main>;
}
