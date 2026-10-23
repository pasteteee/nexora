"use client";
import { useEffect, useRef } from "react";
import { useEditor } from "@/lib/editor/store";
import { MAX_TEXT, textCss } from "@/lib/editor/styles";
import { useUi } from "@/lib/editor/ui";
import type { CanvasElement } from "@/lib/types";
import s from "./elements.module.css";

/** Текст объекта; двойной клик — редактирование на месте, сохранение при потере фокуса */
export function TextBody({ el, placeholder, className }: { el: CanvasElement; placeholder?: string; className?: string }) {
  const editing = useUi((u) => u.editing === el.id);
  const ref = useRef<HTMLDivElement>(null);
  const text = String(el.content.text ?? "");
  const max = MAX_TEXT[el.type as keyof typeof MAX_TEXT] ?? 20000;

  useEffect(() => {
    const node = ref.current;
    if (!editing || !node) return;
    node.textContent = text;
    node.focus();
    const sel = getSelection();
    sel?.selectAllChildren(node);
    sel?.collapseToEnd();
    // текст из состояния подставляется только при входе в редактирование
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function commit() {
    const node = ref.current;
    if (!node) return;
    const next = (node.innerText ?? "").replace(/\n$/, "").slice(0, max);
    useUi.getState().setEditing(null);
    const st = useEditor.getState();
    const cur = st.els[el.id];
    if (!cur) return;
    const patch: Partial<CanvasElement> = {};
    if (next !== String(cur.content.text ?? "")) patch.content = { ...cur.content, text: next };
    // текстовый блок растёт по содержимому
    if (cur.type === "text" && node.scrollHeight > cur.height) patch.height = Math.ceil(node.scrollHeight);
    if (Object.keys(patch).length) st.apply({ [el.id]: patch }, "text");
  }

  function onInput() {
    const node = ref.current!;
    if (node.innerText.length > max) {
      node.textContent = node.innerText.slice(0, max);
      getSelection()?.selectAllChildren(node);
      getSelection()?.collapseToEnd();
    }
  }

  if (editing) {
    return (
      <div
        ref={ref}
        className={`${s.text} ${s.editing} ${className ?? ""}`}
        style={textCss(el.style)}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        data-max={max}
        onInput={onInput}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") (e.currentTarget as HTMLElement).blur();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <div className={`${s.text} ${className ?? ""}`} style={textCss(el.style)} data-empty={!text || undefined} data-placeholder={placeholder}>
      {text}
    </div>
  );
}
