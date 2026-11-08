"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { MATH_KEYS, insertMathKey, toTex } from "@/lib/editor/board/math";
import { Popover } from "./Popover";
import s from "./board.module.css";

export function MathView({ src }: { src: string }) {
  const html = useMemo(() => {
    const tex = toTex(src);
    if (!tex) return null;
    try { return katex.renderToString(tex, { throwOnError: false, displayMode: true, trust: false, maxExpand: 500 }); } catch { return ""; }
  }, [src]);
  if (html === null) return <span className={s.mathEmpty}>Нажмите и напишите формулу, например (x+1)/2</span>;
  if (!html) return <code>{src}</code>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Formula on the page. Editing happens in a popover above the formula: the input, a row of keys
 * and a short hint. The page underneath does not move.
 */
export function MathLine({ src, lid, edit, autoOpen, onChange, onDone, onRemove, onNeighbour }: {
  src: string; lid?: string; edit: boolean; autoOpen?: number;
  onChange(src: string): void; onDone(): void; onRemove?(): void; onNeighbour?(d: -1 | 1): void;
}) {
  const [view, setView] = useState<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(!!autoOpen && edit);
  const [seen, setSeen] = useState(autoOpen);
  if (seen !== autoOpen) { setSeen(autoOpen); if (autoOpen && edit) setOpen(true); }
  useEffect(() => {
    if (!open) return;
    const n = input.current;
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  }, [open]);
  return <>
    <div ref={setView} className={s.math} data-lid={lid} data-math tabIndex={edit ? 0 : -1} role={edit ? "button" : undefined}
      aria-label={edit ? "Формула. Нажмите, чтобы изменить" : "Формула"} data-editing={open || undefined}
      onClick={() => edit && setOpen(true)}
      onKeyDown={(e) => {
        if (!edit) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
        else if ((e.key === "Backspace" || e.key === "Delete") && onRemove) { e.preventDefault(); onRemove(); }
        else if (e.key === "ArrowUp" && onNeighbour) { e.preventDefault(); onNeighbour(-1); }
        else if (e.key === "ArrowDown" && onNeighbour) { e.preventDefault(); onNeighbour(1); }
      }}>
      <MathView src={src} />
    </div>
    {open && <Popover anchor={view} onClose={() => setOpen(false)} label="Формула">
      <div className={s.form}>
        <input ref={input} className={s.mathIn} value={src} autoComplete="off" spellCheck={false} aria-label="Формула обычным текстом"
          placeholder="Например: (x+1)/2,  x^2,  sqrt(x),  pi"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setOpen(false); onDone(); } }} />
        <div className={s.mathKeys}>
          {MATH_KEYS.map((k) => <button key={k[0]} type="button" title={`${k[1]}: ${k[2].trim()}`} onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              const n = input.current; if (!n) return;
              const r = insertMathKey(n.value, n.selectionStart ?? n.value.length, n.selectionEnd ?? n.value.length, k);
              onChange(r.value);
              requestAnimationFrame(() => { n.focus(); n.setSelectionRange(r.caret, r.caret); });
            }}>{k[0]}</button>)}
        </div>
        <p className={s.hint}>Пишите как в калькуляторе: <b>/</b> дробь, <b>^</b> степень, <b>_</b> индекс, <b>sqrt()</b> корень, <b>pi</b>, <b>-&gt;</b>. Можно по-русски: «корень», «пи». LaTeX тоже понимается. <b>Enter</b> готово.</p>
      </div>
    </Popover>}
  </>;
}
