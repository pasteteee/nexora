"use client";
import { arrowHead, endpoints } from "@/lib/editor/connector";
import { useEditor } from "@/lib/editor/store";
import { strokeOf } from "@/lib/editor/styles";
import type { Pt } from "@/lib/editor/geometry";
import s from "./editor.module.css";

/** Соединители поверх объектов: видимая линия и широкая прозрачная зона попадания */
export function ConnectorLayer({ draft }: { draft: { a: Pt; b: Pt } | null }) {
  const els = useEditor((st) => st.els);
  const lines = Object.values(els).filter((e) => e.type === "connector");
  return (
    <svg className={s.connectors}>
      {lines.map((el) => {
        const p = endpoints(el, els);
        if (!p) return null;
        const color = strokeOf(el.style.stroke);
        const arrow = el.style.arrow !== "none";
        const dashed = el.style.dash === true;
        return (
          <g key={el.id} data-id={el.id} className={s.connector}>
            <line x1={p.a.x} y1={p.a.y} x2={p.b.x} y2={p.b.y} stroke="transparent" strokeWidth={16} />
            <line x1={p.a.x} y1={p.a.y} x2={p.b.x} y2={p.b.y} stroke={color} strokeWidth={2} strokeLinecap="round"
              strokeDasharray={dashed ? "6 6" : undefined} />
            {arrow && <polygon points={arrowHead(p.a, p.b)} fill={color} />}
          </g>
        );
      })}
      {draft && (
        <g className={s.draft}>
          <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 6" />
          <polygon points={arrowHead(draft.a, draft.b)} fill="var(--accent)" />
        </g>
      )}
    </svg>
  );
}
