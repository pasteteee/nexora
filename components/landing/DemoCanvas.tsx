"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { MousePointer2 } from "lucide-react";
import s from "./landing.module.css";

type It = { id: string; x: number; y: number; w: number; h: number; kind: "note" | "formula" | "img" | "node"; text?: string; bg?: string; rot?: number };

// позиции в процентах экрана — сцена тянется на любую ширину
const START: It[] = [
  { id: "a", x: 8, y: 16, w: 210, h: 120, kind: "note", text: "Идеи к курсовой: связать лекции и статьи", bg: "var(--note-yellow)", rot: -3 },
  { id: "b", x: 72, y: 13, w: 200, h: 64, kind: "formula", text: "∮ E·dl = −dΦ/dt" },
  { id: "c", x: 76, y: 60, w: 220, h: 150, kind: "img", rot: 2 },
  { id: "d", x: 12, y: 68, w: 120, h: 120, kind: "node", text: "Глава 1" },
  { id: "e", x: 40, y: 78, w: 190, h: 96, kind: "note", text: "Цитата из PDF, стр. 14", bg: "var(--note-blue)", rot: 2 },
];
const WIRES: [string, string][] = [["a", "d"], ["d", "e"], ["b", "c"]];

export function DemoCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState(START);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const box = () => ref.current?.getBoundingClientRect() ?? { width: 1, height: 1, left: 0, top: 0 };
  const px = (it: It) => { const b = box(); return { x: (it.x / 100) * b.width, y: (it.y / 100) * b.height }; };

  function down(e: PointerEvent, it: It) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = px(it); const b = box();
    setDrag({ id: it.id, dx: e.clientX - b.left - p.x, dy: e.clientY - b.top - p.y });
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const b = box();
    const x = ((e.clientX - b.left - drag.dx) / b.width) * 100;
    const y = ((e.clientY - b.top - drag.dy) / b.height) * 100;
    setItems((list) => list.map((i) => (i.id === drag.id ? { ...i, x: Math.max(-5, Math.min(95, x)), y: Math.max(0, Math.min(92, y)) } : i)));
  }

  const anchor = (id: string) => {
    const i = items.find((x) => x.id === id)!;
    return { x: (i.x / 100) * size.w + i.w / 2, y: (i.y / 100) * size.h + i.h / 2 };
  };

  return (
    <div ref={ref} className={s.hero} onPointerMove={move} onPointerUp={() => setDrag(null)}>
      <svg className={s.wires} aria-hidden>
        {size.w > 0 && WIRES.map(([a, b]) => {
          const p = anchor(a), q = anchor(b);
          const mx = (p.x + q.x) / 2;
          return <path key={a + b} d={`M ${p.x} ${p.y} C ${mx} ${p.y}, ${mx} ${q.y}, ${q.x} ${q.y}`} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="5 6" />;
        })}
      </svg>
      <h1 className={s.headline}>Думай<br /><span>на холсте</span></h1>
      {items.map((it, n) => (
        <div
          key={it.id}
          className={`${s.item} ${s[it.kind]} ${drag?.id === it.id ? s.dragging : ""}`}
          style={{ left: `${it.x}%`, top: `${it.y}%`, width: it.w, height: it.h, background: it.bg, rotate: `${it.rot ?? 0}deg`, animationDelay: `${n * 70}ms` }}
          onPointerDown={(e) => down(e, it)}
        >
          {it.text}
        </div>
      ))}
      <div className={s.hint}><MousePointer2 size={14} /> Потяните любую карточку</div>
    </div>
  );
}
