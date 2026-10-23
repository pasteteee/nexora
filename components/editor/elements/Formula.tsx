"use client";
import { useEffect, useMemo, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useEditor } from "@/lib/editor/store";
import { useUi } from "@/lib/editor/ui";
import type { CanvasElement } from "@/lib/types";
import s from "./elements.module.css";

/** LaTeX-формула: при ошибке показываются исходная строка и сообщение (ТЗ 4.2.5) */
export function Formula({ el }: { el: CanvasElement }) {
  const latex = String(el.content.latex ?? "");
  const editing = useUi((u) => u.editing === el.id);
  const ref = useRef<HTMLTextAreaElement>(null);
  const out = useMemo(() => {
    try { return { html: katex.renderToString(latex || "\\square", { throwOnError: true, displayMode: true }) }; }
    catch (e) { return { error: (e as Error).message.replace(/^KaTeX parse error: /, "") }; }
  }, [latex]);

  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  function commit(v: string) {
    useUi.getState().setEditing(null);
    const cur = useEditor.getState().els[el.id];
    if (cur && v !== latex) useEditor.getState().apply({ [el.id]: { content: { ...cur.content, latex: v.slice(0, 2000) } } }, "text");
  }

  const fontSize = Number(el.style.fontSize ?? 20);
  return (
    <div className={s.formula} style={{ fontSize }}>
      {editing ? (
        <textarea
          ref={ref}
          className={s.latexInput}
          defaultValue={latex}
          spellCheck={false}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); e.currentTarget.blur(); }
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : "html" in out ? (
        <div className={s.katex} dangerouslySetInnerHTML={{ __html: out.html! }} />
      ) : (
        <div className={s.formulaError}>
          <code>{latex}</code>
          <span>{out.error}</span>
        </div>
      )}
    </div>
  );
}
