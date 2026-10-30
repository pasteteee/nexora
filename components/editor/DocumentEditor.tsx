"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Paperclip, Plus, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { useUi } from "@/lib/editor/ui";
import { makeElement } from "@/lib/editor/factory";
import { documentBlocks, isTextBlock, mergeText, moveBlock, orderPatches, splitText } from "@/lib/editor/document";
import { insertImages, insertSources, pickFiles } from "@/lib/editor/actions";
import { IMAGE_ACCEPT, SOURCE_ACCEPT } from "@/lib/data/upload-rules";
import type { CanvasElement } from "@/lib/types";
import { Markdown } from "./elements/Markdown";
import { ImageView } from "./elements/ImageView";
import { Formula } from "./elements/Formula";
import { SourceCard } from "./elements/SourceCard";
import s from "./document.module.css";

type Focus = { id: string; caret: number; seq: number } | null;
const textOf = (el: CanvasElement) => String(el.content.text ?? "");

function TextInput({ el, focus, onFocus, onBlur, onKey }: { el: CanvasElement; focus: Focus; onFocus(): void; onBlur(): void; onKey(e: React.KeyboardEvent<HTMLTextAreaElement>): void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = textOf(el);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.max(28, node.scrollHeight)}px`;
  }, [text]);
  useEffect(() => {
    const node = ref.current;
    if (focus?.id !== el.id || !node) return;
    node.focus();
    const caret = Math.min(focus.caret, node.value.length);
    node.setSelectionRange(caret, caret);
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus, el.id]);
  return <textarea ref={ref} className={s.input} aria-label="Текст блока" placeholder="Начните писать…" value={text} rows={1} autoFocus maxLength={20000}
    onFocus={onFocus} onBlur={onBlur} onKeyDown={onKey}
    onChange={(e) => {
      const st = useEditor.getState(), current = st.els[el.id];
      if (current) st.apply({ [el.id]: { content: { ...current.content, text: e.target.value } } }, "text");
    }} />;
}

/** Native scrolling Markdown document; canvas geometry is retained solely for data compatibility. */
export function DocumentEditor({ title }: { title?: string }) {
  const els = useEditor((st) => st.els), canEdit = useEditor((st) => st.canEdit), canvasId = useEditor((st) => st.canvasId);
  const blocks = documentBlocks(els);
  const [active, setActive] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  function activate(id: string, caret = 0) {
    setActive(id); setFocus({ id, caret, seq: ++seq.current });
    useEditor.getState().select([id]);
  }
  useEffect(() => {
    const st = useEditor.getState();
    if (st.canEdit && st.canvasId && !documentBlocks(st.els).length) {
      const el = makeElement("text", { x: 0, y: 0 }, st.canvasId, 1, { content: { text: "", documentOrder: 0 } });
      st.add([el]);
    } else if (st.canEdit && documentBlocks(st.els).some((el) => typeof el.content.documentOrder !== "number" || !Number.isFinite(el.content.documentOrder))) {
      // One-time legacy migration also fixes new AI/material insertions to the flow tail.
      st.apply(orderPatches(documentBlocks(st.els)));
    }
  }, [canvasId, canEdit, blocks.length]);
  // Materials/AI inserts select their new block. Reveal it without disturbing typing.
  const selected = useEditor((st) => st.selected);
  useEffect(() => {
    const node = root.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(selected[0] ?? "")}"]`);
    if (node && !node.contains(document.activeElement)) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  function addAfter(afterId?: string) {
    const st = useEditor.getState();
    if (!st.canEdit || !st.canvasId) return;
    const list = documentBlocks(st.els);
    const index = afterId ? list.findIndex((b) => b.id === afterId) + 1 : list.length;
    const el = makeElement("text", { x: 0, y: 0 }, st.canvasId, list.length + 1, { content: { text: "" } });
    list.splice(index, 0, el);
    const patches = orderPatches(list);
    el.content = patches[el.id].content!;
    delete patches[el.id];
    st.batch({ add: [el], patch: patches });
    activate(el.id);
  }
  function reorder(id: string, index: number) {
    const st = useEditor.getState();
    st.apply(orderPatches(moveBlock(documentBlocks(st.els), id, index)));
    st.select([id]);
  }
  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>, el: CanvasElement, index: number) {
    if (e.nativeEvent.isComposing) return;
    const node = e.currentTarget, st = useEditor.getState();
    const start = node.selectionStart, end = node.selectionEnd;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const [left, right] = splitText(node.value, start, end);
      const next = makeElement("text", { x: 0, y: 0 }, el.canvasId, blocks.length + 1, { content: { text: right } });
      const current = { ...st.els[el.id], content: { ...st.els[el.id].content, text: left } };
      const list = documentBlocks(st.els).map((b) => b.id === el.id ? current : b);
      list.splice(index + 1, 0, next);
      const patches = orderPatches(list); next.content = patches[next.id].content!; delete patches[next.id];
      st.batch({ add: [next], patch: patches }); activate(next.id);
    } else if (e.key === "Backspace" && start === 0 && end === 0 && index > 0 && isTextBlock(blocks[index - 1])) {
      e.preventDefault();
      const previous = blocks[index - 1], merged = mergeText(textOf(previous), node.value);
      st.batch({ patch: { [previous.id]: { content: { ...previous.content, text: merged.text } } }, remove: [el.id] });
      activate(previous.id, merged.caret);
    } else if (e.key === "ArrowUp" && start === 0 && end === 0 && index > 0 && isTextBlock(blocks[index - 1])) {
      e.preventDefault(); activate(blocks[index - 1].id, textOf(blocks[index - 1]).length);
    } else if (e.key === "ArrowDown" && start === node.value.length && end === start && index + 1 < blocks.length && isTextBlock(blocks[index + 1])) {
      e.preventDefault(); activate(blocks[index + 1].id);
    } else if (e.key === "Escape") { node.blur(); }
  }
  async function upload(kind: "image" | "source", files?: File[]) {
    const chosen = files ?? await pickFiles(kind === "image" ? IMAGE_ACCEPT : SOURCE_ACCEPT);
    if (!chosen.length) return;
    // Material/AI insertions lacking explicit order should append after all current blocks.
    const st = useEditor.getState();
    st.apply(orderPatches(documentBlocks(st.els)));
    if (kind === "image") await insertImages(chosen, { x: 0, y: 0 });
    else await insertSources(chosen, { x: 0, y: 0 });
  }
  return <div ref={root} className={s.editor} aria-label={title ? `Документ: ${title}` : "Документ"} onKeyDown={(e) => {
    const target = e.target as HTMLElement;
    if (canEdit && !target.matches("textarea,input,[contenteditable]" ) && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault(); if (e.shiftKey) useEditor.getState().redo(); else useEditor.getState().undo();
    }
  }} onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
  onDrop={(e) => { if (canEdit && e.dataTransfer.files.length) { e.preventDefault(); const files = [...e.dataTransfer.files]; void upload("image", files.filter((f) => f.type.startsWith("image/"))); void upload("source", files.filter((f) => !f.type.startsWith("image/"))); } }}>
    <article className={s.document}>
      <div className={s.blocks}>{blocks.map((el, index) => {
        const editing = canEdit && isTextBlock(el) && (active === el.id || (blocks.length === 1 && !textOf(el)));
        return <section key={el.id} data-block-id={el.id} data-selected={selected.includes(el.id) || undefined} className={`${s.block} ${dropTarget === el.id ? s.dropTarget : ""}`}
          onDragOver={(e) => { if (canEdit && dragging && dragging !== el.id) { e.preventDefault(); setDropTarget(el.id); } }}
          onDrop={(e) => { if (dragging) { e.preventDefault(); reorder(dragging, index - (blocks.findIndex((b) => b.id === dragging) < index ? 1 : 0)); setDragging(null); setDropTarget(null); } }}
          onClick={() => useEditor.getState().select([el.id])}>
          {canEdit && <div className={s.controls} onClick={(e) => e.stopPropagation()}>
            <button className={s.grip} draggable title="Перетащить блок" aria-label="Перетащить блок" onDragStart={(e) => { setDragging(el.id); e.dataTransfer.setData("text/plain", el.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDragging(null); setDropTarget(null); }}><GripVertical size={16} /></button>
            <div className={s.blockMenu}>
              <button aria-label="Переместить блок вверх" disabled={index === 0} onClick={() => reorder(el.id, index - 1)}><ArrowUp size={14} /></button>
              <button aria-label="Переместить блок вниз" disabled={index === blocks.length - 1} onClick={() => reorder(el.id, index + 1)}><ArrowDown size={14} /></button>
              <button aria-label="Добавить текст после блока" onClick={() => addAfter(el.id)}><Plus size={14} /></button>
              <button aria-label="Удалить блок" onClick={() => useEditor.getState().remove([el.id])}><Trash2 size={14} /></button>
            </div>
          </div>}
          {isTextBlock(el) ? editing ? <TextInput el={el} focus={focus} onFocus={() => useEditor.getState().select([el.id])} onBlur={() => setActive(null)} onKey={(e) => onKey(e, el, index)} />
            : <div className={s.markdown} tabIndex={canEdit ? 0 : undefined} role={canEdit ? "button" : undefined} aria-label={canEdit ? "Редактировать текст блока" : undefined} onClick={() => canEdit && activate(el.id, textOf(el).length)} onKeyDown={(e) => { if (canEdit && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); activate(el.id, textOf(el).length); } }}><Markdown text={textOf(el)} /></div>
          : el.type === "image" ? <div className={s.image}><ImageView el={el} /></div>
          : el.type === "formula" ? <div className={s.formula} onDoubleClick={() => canEdit && useUi.getState().setEditing(el.id)}><Formula el={el} /></div>
          : el.type === "source" || el.type === "source_fragment" ? <div className={s.source}><SourceCard el={el} /></div>
          : <div className={s.legacy}>↗ {String(el.content.text ?? "Связь между блоками")}</div>}
        </section>;
      })}</div>
      {canEdit && <div className={s.insert} onDragOver={(e) => { if (dragging) e.preventDefault(); }} onDrop={(e) => { if (dragging) { e.preventDefault(); reorder(dragging, blocks.length - 1); setDragging(null); setDropTarget(null); } }}>
        <button onClick={() => addAfter()}><Plus size={16} />Продолжить писать</button>
        <button onClick={() => void upload("image")}><ImagePlus size={16} />Изображение</button>
        <button onClick={() => void upload("source")}><Paperclip size={16} />Файл</button>
      </div>}
      {canEdit && <p className={s.hint}>Enter — новый блок · Shift + Enter — строка · Markdown · Перетаскивайте блоки за ⋮⋮</p>}
      {!blocks.length && !canEdit && <p className={s.hint}>На этой странице пока ничего нет</p>}
    </article>
  </div>;
}
