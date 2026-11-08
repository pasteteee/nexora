import type { ReactNode } from "react";
import s from "./notebooks.module.css";

/** Bookcloth colours of notebook covers. Picked by id, so a notebook keeps its colour. */
const CLOTH = ["#1f4e8c", "#0e6b6b", "#a8432a", "#5f6b2e", "#3a3f46", "#6b3a5b", "#9a6a1f", "#4a6a8f"];

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const coverColor = (id: string) => CLOTH[hash(id) % CLOTH.length];

/** Notebook cover: cloth with a spine and a paper label, like a school notebook on a shelf. */
export function Cover({ id, children, muted }: { id: string; children?: ReactNode; muted?: boolean }) {
  return <div className={s.cover} style={{ "--cloth": coverColor(id) } as React.CSSProperties} data-muted={muted || undefined}>
    <span className={s.spine} aria-hidden />
    <div className={s.label}>{children}</div>
  </div>;
}
