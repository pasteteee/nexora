"use client";
import { memo, useLayoutEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import katex from "katex";
import { Check, GripVertical, Plus } from "lucide-react";
import { useDoc } from "@/lib/doc/store";
import { LISTS, MAX_INDENT, PLAIN, readingOrder, type BlockKind } from "@/lib/doc/model";
import { caretOnEdgeLine, caretRect, deleteChars, escapeText, getCaret, sanitize, setCaret, splitAtCaret, textLength } from "@/lib/doc/html";
import { MD_SHORTCUTS, PLACEHOLDER } from "./kinds";
import { useSlash } from "./slash";
import s from "./doc.module.css";

const BULLETS = ["•", "◦", "▪"];

type Props = {
  id: string;
  num: number;
  onGrip: (e: React.PointerEvent, id: string) => void;
  onAdd: (id: string) => void;
};

/** Один блок документа: ручка на полях + содержимое по типу */
export const Block = memo(function Block({ id, num, onGrip, onAdd }: Props) {
  const b = useDoc((st) => st.blocks[id]);
  const canEdit = useDoc((st) => st.canEdit);
  const selected = useDoc((st) => st.selected.includes(id));
  if (!b) return null;

  const marker =
    b.kind === "bullet" ? <span className={s.marker} aria-hidden>{BULLETS[b.indent % 3]}</span>
    : b.kind === "numbered" ? <span className={`${s.marker} ${s.num}`} aria-hidden>{num}.</span>
    : b.kind === "todo" ? (
      <button
        type="button"
        className={s.check}
        role="checkbox"
        aria-checked={b.checked}
        aria-label={b.checked ? "Отметить невыполненной" : "Отметить выполненной"}
        disabled={!canEdit}
        onClick={() => useDoc.getState().update(id, { checked: !b.checked })}
      >
        {b.checked && <Check size={13} strokeWidth={3} />}
      </button>
    ) : null;

  return (
    <div
      className={s.block}
      data-block-id={id}
      data-kind={b.kind}
      data-tint={b.tint ?? undefined}
      data-checked={b.kind === "todo" && b.checked ? "" : undefined}
      data-selected={selected ? "" : undefined}
      style={{ "--indent": b.indent } as React.CSSProperties}
    >
      {canEdit && (
        <div className={s.handles}>
          <button type="button" className={s.handle} aria-label="Добавить блок ниже" title="Добавить блок ниже" onClick={() => onAdd(id)}>
            <Plus size={16} />
          </button>
          <button
            type="button"
            className={`${s.handle} ${s.grip}`}
            aria-label="Перетащить блок или открыть меню"
            title="Потяните, чтобы переместить. Нажмите — меню блока"
            onPointerDown={(e) => onGrip(e, id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGrip(e as unknown as React.PointerEvent, id); }
            }}
          >
            <GripVertical size={16} />
          </button>
        </div>
      )}
      <div className={s.body}>
        {marker}
        {b.kind === "divider" ? (
          <button type="button" className={s.divider} aria-label="Разделитель" onClick={() => useDoc.getState().select([id])}><hr /></button>
        ) : b.kind === "formula" ? (
          <Formula id={id} text={b.text} canEdit={canEdit} />
        ) : (
          <Editable id={id} kind={b.kind} text={b.text} canEdit={canEdit} />
        )}
      </div>
    </div>
  );
});

/* ---------- редактируемый текст ---------- */

function Editable({ id, kind, text, canEdit, onBlur }: { id: string; kind: BlockKind; text: string; canEdit: boolean; onBlur?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const local = useRef<string | null>(null);
  const focus = useDoc((st) => (st.focus?.id === id ? st.focus : null));
  const plainKind = PLAIN.has(kind);

  // текст из стора попадает в DOM только если пришёл не из этого поля (отмена, склейка, вставка)
  useLayoutEffect(() => {
    const el = ref.current!;
    if (local.current === text) return;
    if (plainKind) el.textContent = text; else el.innerHTML = text;
    local.current = text;
  }, [text, plainKind]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!focus || !el) return;
    el.focus({ preventScroll: true });
    setCaret(el, focus.at);
    const r = el.getBoundingClientRect();
    if (r.top < 64 || r.bottom > window.innerHeight - 24) el.scrollIntoView({ block: "nearest" });
  }, [focus]);

  const st = () => useDoc.getState();
  const read = (el: HTMLElement) => (plainKind ? el.textContent ?? "" : sanitize(el.innerHTML));
  const commit = (el: HTMLElement) => {
    const v = read(el);
    if (!plainKind && v === "" && el.innerHTML !== "") el.innerHTML = "";
    local.current = v;
    st().setText(id, v);
    return v;
  };

  function onInput(e: FormEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const v = commit(el);
    const ev = e.nativeEvent as InputEvent;
    const slash = useSlash.getState();

    if (slash.open && slash.id === id) {
      const caret = getCaret(el)?.start ?? 0;
      const q = (el.textContent ?? "").slice(slash.start + 1, caret);
      if (caret <= slash.start || q.length > 24 || /\s\s/.test(q)) slash.close();
      else slash.setQuery(q);
    } else if (ev.data === "/" && !plainKind) {
      const caret = getCaret(el)?.start ?? 1;
      const r = caretRect() ?? el.getBoundingClientRect();
      slash.show(id, caret - 1, r.left, r.bottom + 6);
    }

    // markdown в начале строки
    if (plainKind || ev.inputType !== "insertText") return;
    const raw = el.textContent ?? "";
    if (ev.data === " ") {
      const caret = getCaret(el)?.start ?? 0;
      for (const [md, kind2] of MD_SHORTCUTS) {
        if (caret === md.length + 1 && raw.startsWith(md + " ")) {
          const rest = deleteChars(el, 0, md.length + 1);
          local.current = rest;
          if (kind2 === "formula") { st().update(id, { kind: kind2, text: "" }); st().focusBlock(id, "start"); }
          else { st().update(id, { kind: kind2, text: rest }); st().focusBlock(id, "start"); }
          slash.close();
          return;
        }
      }
    }
    if (raw === "---" || raw === "***") { local.current = ""; st().update(id, { kind: "divider", text: "" }); st().insertAfter(id); return; }
    if (raw === "```") { local.current = ""; el.textContent = ""; st().update(id, { kind: "code", text: "" }); st().focusBlock(id, "start"); }
    void v;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const slash = useSlash.getState();
    if (slash.open && slash.id === id && slash.onKey(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const b = st().blocks[id];
    if (!b) return;

    if (mod && !e.altKey && (k === "z" || k === "Z" || k === "я" || k === "Я")) { e.preventDefault(); if (e.shiftKey) st().redo(); else st().undo(); return; }
    if (mod && (k === "y" || k === "н")) { e.preventDefault(); st().redo(); return; }
    if (mod && e.shiftKey && (k === "ArrowUp" || k === "ArrowDown")) { e.preventDefault(); st().moveBy(id, k === "ArrowUp" ? -1 : 1); st().focusBlock(id, getCaret(el)?.start ?? "end"); return; }
    if (mod && (k === "d" || k === "в")) { e.preventDefault(); st().duplicate([id]); return; }
    if (k === "Escape") { e.preventDefault(); el.blur(); st().select([id]); return; }

    if (k === "Tab") {
      e.preventDefault();
      if (kind === "code") { document.execCommand("insertText", false, "  "); return; }
      const indent = Math.max(0, Math.min(MAX_INDENT, b.indent + (e.shiftKey ? -1 : 1)));
      if (indent !== b.indent) { const at = getCaret(el)?.start ?? "end"; st().update(id, { indent }); st().focusBlock(id, at); }
      return;
    }

    if (k === "Enter") {
      if (kind === "code") {
        if (mod || e.shiftKey) { e.preventDefault(); st().insertAfter(id); return; }
        e.preventDefault();
        document.execCommand("insertText", false, "\n");
        return;
      }
      e.preventDefault();
      if (e.shiftKey) { document.execCommand("insertLineBreak"); return; }
      if (kind === "formula") { onBlur?.(); st().insertAfter(id); return; }
      const empty = (el.textContent ?? "") === "";
      if (empty && (LISTS.has(kind) || kind === "quote" || kind === "callout" || b.indent > 0)) {
        if (b.indent > 0) st().update(id, { indent: b.indent - 1 }); else st().update(id, { kind: "p" });
        st().focusBlock(id, "start");
        return;
      }
      const [head, tail] = splitAtCaret(el);
      el.innerHTML = head;
      local.current = head;
      const next = LISTS.has(kind) ? kind : "p";
      st().split(id, head, tail, head === "" && tail !== "" ? kind : next);
      return;
    }

    const caret = getCaret(el);
    const collapsed = caret && caret.start === caret.end;
    if (k === "Backspace" && collapsed && caret.start === 0) {
      if (kind !== "p") {
        e.preventDefault();
        if (kind === "formula" && (el.textContent ?? "") !== "") return;
        st().update(id, { kind: "p" });
        st().focusBlock(id, "start");
        return;
      }
      if (b.indent > 0) { e.preventDefault(); st().update(id, { indent: b.indent - 1 }); st().focusBlock(id, "start"); return; }
      if (st().mergeUp(id)) e.preventDefault();
      return;
    }
    if (k === "Delete" && collapsed && caret.start === textLength(el)) {
      const order = readingOrder(st().items);
      const next = order[order.indexOf(id) + 1];
      const nb = next && st().blocks[next];
      if (nb && !PLAIN.has(nb.kind) && !plainKind) { e.preventDefault(); st().mergeUp(next); }
      return;
    }

    const order = () => readingOrder(st().items);
    const go = (dir: -1 | 1, at: "start" | "end") => {
      const list = order();
      const to = list[list.indexOf(id) + dir];
      if (!to) return false;
      if (st().blocks[to]?.kind === "divider") { st().select([to]); el.blur(); return true; }
      st().focusBlock(to, at);
      return true;
    };
    if (k === "ArrowUp" && !e.shiftKey && caretOnEdgeLine(el, "top")) { if (go(-1, "end")) e.preventDefault(); return; }
    if (k === "ArrowDown" && !e.shiftKey && caretOnEdgeLine(el, "bottom")) { if (go(1, "start")) e.preventDefault(); return; }
    if (k === "ArrowLeft" && collapsed && caret.start === 0) { if (go(-1, "end")) e.preventDefault(); return; }
    if (k === "ArrowRight" && collapsed && caret.start === textLength(el)) { if (go(1, "start")) e.preventDefault(); }
  }

  /** Вставка: только текст; несколько строк — несколько блоков */
  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const txt = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (!txt) return;
    const lines = txt.split("\n");
    if (plainKind || lines.length === 1) { document.execCommand("insertText", false, plainKind ? txt : lines[0]); return; }
    const el = e.currentTarget;
    document.execCommand("insertText", false, lines[0]);
    const [head, tail] = splitAtCaret(el);
    el.innerHTML = head;
    commit(el);
    const inits = lines.slice(1).map((line) => {
      for (const [md, k2] of MD_SHORTCUTS) {
        if (line.startsWith(md + " ") && k2 !== "formula") return { kind: k2, text: escapeText(line.slice(md.length + 1)) };
      }
      return { kind: "p" as BlockKind, text: escapeText(line) };
    }).filter((x, i, a) => x.text || i === a.length - 1);
    if (inits.length) inits[inits.length - 1].text += tail;
    st().insertBlocks(id, inits);
  }

  return (
    <div
      ref={ref}
      className={plainKind ? (kind === "code" ? s.code : s.tex) : s.text}
      contentEditable={canEdit ? (plainKind ? "plaintext-only" : true) : false}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      aria-label={PLACEHOLDER[kind] ?? "Текст"}
      data-ph={PLACEHOLDER[kind]}
      data-editable
      spellCheck={!plainKind}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={() => st().selected.length && st().select([])}
      onBlur={() => { useSlash.getState().closeFor(id); onBlur?.(); }}
    />
  );
}

/* ---------- формула: TeX в режиме правки, KaTeX — в режиме чтения ---------- */

function Formula({ id, text, canEdit }: { id: string; text: string; canEdit: boolean }) {
  const focusN = useDoc((st) => (st.focus?.id === id ? st.focus.n : 0));
  // правка открывается каждым новым фокусом и закрывается уходом из поля
  const [closedAt, setClosedAt] = useState(0);
  const html = renderTex(text);
  const editingNow = canEdit && (focusN > closedAt || !text);

  return (
    <div className={s.formula}>
      {editingNow && (
        <Editable id={id} kind="formula" text={text} canEdit onBlur={() => setClosedAt(focusN)} />
      )}
      {text && (
        <div
          className={s.katex}
          role={canEdit ? "button" : undefined}
          tabIndex={canEdit && !editingNow ? 0 : undefined}
          aria-label={canEdit ? "Изменить формулу" : undefined}
          onClick={() => canEdit && useDoc.getState().focusBlock(id, "end")}
          onKeyDown={(e) => e.key === "Enter" && canEdit && useDoc.getState().focusBlock(id, "end")}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function renderTex(tex: string) {
  if (!tex) return "";
  try {
    return katex.renderToString(tex, { displayMode: true, throwOnError: false, strict: "ignore" });
  } catch {
    return escapeText(tex);
  }
}
