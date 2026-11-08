"use client";
import { useState } from "react";
import { CATALOG, LINE_PLACEHOLDER, LINE_TYPES, MD_SHORTCUTS, linesOf, uid, type Line, type LineType, type Widget } from "@/lib/editor/board/model";
import { AutoText } from "./AutoText";
import { MathLine } from "./MathLine";
import { MenuList, Popover, menuActions, type MenuItem } from "./Popover";
import { useBoard } from "./context";
import s from "./board.module.css";

let openSeq = 0;
const nextOpen = () => ++openSeq;
const LIST = new Set<LineType>(["li", "ol", "todo"]);

/** Text widget: Markdown-style lines. `/` opens blocks and widgets above the line, nothing shifts. */
export function TextWidget({ w }: { w: Widget }) {
  const api = useBoard();
  const lines = linesOf(w.el);
  const [slash, setSlash] = useState<{ lid: string; q: string; sel: number; anchor: HTMLElement } | null>(null);
  const [mathOpen, setMathOpen] = useState<{ lid: string; n: number } | null>(null);

  const save = (next: Line[]) => api.setLines(w, next);
  const focus = (lid: string, at: "start" | "end" | number = "end") => api.focus({ id: w.id, lid, at });
  const convert = (ln: Line, t: LineType) => {
    const next = lines.map((l) => l.id !== ln.id ? l : t === "math" ? { id: l.id, t, src: "" } : { ...l, t, text: ln.text ?? "" });
    save(next);
    if (t === "math") setMathOpen({ lid: ln.id, n: nextOpen() }); else focus(ln.id);
  };
  const removeLine = (ln: Line) => {
    const i = lines.findIndex((l) => l.id === ln.id);
    if (lines.length === 1) {
      if (ln.t === "p" && !ln.text) { api.remove(w.id); return; }
      save([{ id: ln.id, t: "p", text: "" }]); focus(ln.id); return;
    }
    save(lines.filter((l) => l.id !== ln.id));
    const prev = lines[Math.max(0, i - 1)];
    if (prev && prev.id !== ln.id) focus(prev.id);
  };
  const neighbour = (ln: Line, d: -1 | 1) => {
    const t = lines[lines.findIndex((l) => l.id === ln.id) + d];
    if (!t) return false;
    if (t.t === "math") api.focus({ id: w.id, lid: t.id }); else focus(t.id, d < 0 ? "end" : "start");
    return true;
  };
  const afterMath = (ln: Line) => {
    const i = lines.findIndex((l) => l.id === ln.id);
    const nl: Line = { id: uid(), t: "p", text: "" };
    save([...lines.slice(0, i + 1), nl, ...lines.slice(i + 1)]);
    focus(nl.id);
  };

  const slashItems = (ln: Line, q: string): MenuItem[] => {
    const query = q.toLowerCase();
    const match = (a: string, k = "") => !query || a.toLowerCase().includes(query) || k.includes(query);
    const own = LINE_TYPES.filter((t) => match(t.label, t.k)).map((t): MenuItem => ({ label: t.label, ico: t.ico, hint: t.hint, run: () => { setSlash(null); convert({ ...ln, text: "" }, t.t); } }));
    const wid = CATALOG.filter((c) => c.t !== "text" && c.t !== "formula" && match(c.name, c.about.toLowerCase()))
      .map((c): MenuItem => ({ label: c.name, ico: c.ico, hint: c.about, run: () => { setSlash(null); api.insertAtLine(w, lines.findIndex((l) => l.id === ln.id), c.t); } }));
    return [...(own.length ? [{ section: "Строка" }, ...own] : []), ...(wid.length ? [{ section: "Виджет на странице" }, ...wid] : [])];
  };

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>, ln: Line, i: number) {
    if (e.nativeEvent.isComposing) return;
    const node = e.currentTarget, off = node.selectionStart, end = node.selectionEnd, len = node.value.length;
    if (slash && slash.lid === ln.id) {
      const acts = menuActions(slashItems(ln, slash.q));
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const d = e.key === "ArrowDown" ? 1 : -1; setSlash({ ...slash, sel: (slash.sel + d + acts.length) % Math.max(1, acts.length) }); return; }
      if (e.key === "Enter") { e.preventDefault(); const a = acts[slash.sel]; if (a) a.run(); else setSlash(null); return; }
      if (e.key === "Escape") { e.preventDefault(); setSlash(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (LIST.has(ln.t) && !len) { convert(ln, "p"); return; }
      const nl: Line = { id: uid(), t: LIST.has(ln.t) ? ln.t : "p", text: node.value.slice(end) };
      save([...lines.slice(0, i), { ...ln, text: node.value.slice(0, off) }, nl, ...lines.slice(i + 1)]);
      focus(nl.id, "start");
      return;
    }
    if (e.key === "Backspace" && off === 0 && end === 0) {
      e.preventDefault();
      if (ln.t !== "p") { convert(ln, "p"); return; }
      const prev = lines[i - 1];
      if (!prev) { if (!len) removeLine(ln); return; }
      if (prev.t === "math") { if (!len) removeLine(ln); else neighbour(ln, -1); return; }
      const at = (prev.text ?? "").length;
      save(lines.filter((l) => l.id !== ln.id).map((l) => l.id === prev.id ? { ...l, text: (l.text ?? "") + node.value } : l));
      focus(prev.id, at);
      return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const k = i + (e.key === "ArrowUp" ? -1 : 1);
      if (k < 0 || k >= lines.length) return;
      const next = [...lines]; next.splice(i, 1); next.splice(k, 0, ln);
      save(next); focus(ln.id, off);
      return;
    }
    if (e.key === "ArrowUp" && off === 0 && end === 0) { if (neighbour(ln, -1)) e.preventDefault(); }
    if (e.key === "ArrowDown" && off === len && end === len) { if (neighbour(ln, 1)) e.preventDefault(); }
  }
  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>, ln: Line) {
    const v = e.target.value.replace(/ /g, " ");
    const md = MD_SHORTCUTS.find(([re]) => re.test(v));
    if (md) { setSlash(null); convert({ ...ln, text: "" }, md[1]); return; }
    save(lines.map((l) => l.id === ln.id ? { ...l, text: e.target.value } : l));
    if (v.startsWith("/")) setSlash({ lid: ln.id, q: v.slice(1), sel: slash?.lid === ln.id && slash.q === v.slice(1) ? slash.sel : 0, anchor: e.target });
    else if (slash) setSlash(null);
  }
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>, ln: Line, i: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\n")) return;
    e.preventDefault();
    const node = e.currentTarget, parts = text.replace(/\r/g, "").split("\n");
    const head = node.value.slice(0, node.selectionStart) + parts[0], tail = node.value.slice(node.selectionEnd);
    const added: Line[] = parts.slice(1).map((p) => ({ id: uid(), t: "p", text: p }));
    const last = added[added.length - 1];
    last.text = (last.text ?? "") + tail;
    save([...lines.slice(0, i), { ...ln, text: head }, ...added, ...lines.slice(i + 1)]);
    focus(last.id, (last.text ?? "").length - tail.length);
  }

  const slashLine = slash ? lines.find((l) => l.id === slash.lid) : null;
  return <div className={s.lines} data-single={lines.length === 1 || undefined}>
    {lines.map((ln, i) => {
      if (ln.t === "math") return <MathLine key={ln.id} lid={ln.id} src={ln.src ?? ""} edit={api.edit} autoOpen={mathOpen?.lid === ln.id ? mathOpen.n : undefined}
        onChange={(src) => save(lines.map((l) => l.id === ln.id ? { ...l, src } : l))}
        onDone={() => afterMath(ln)} onRemove={() => removeLine(ln)} onNeighbour={(d) => neighbour(ln, d)} />;
      return <div key={ln.id} className={s.row} data-line={ln.t} data-done={ln.t === "todo" && ln.done ? "" : undefined}>
        {ln.t === "todo" && <input type="checkbox" checked={!!ln.done} disabled={!api.edit} aria-label="Готово"
          onChange={(e) => save(lines.map((l) => l.id === ln.id ? { ...l, done: e.target.checked } : l))} />}
        <AutoText className={s.line} data-lid={ln.id} value={ln.text ?? ""} readOnly={!api.edit}
          aria-label={ln.t.startsWith("h") ? "Заголовок" : "Строка текста"}
          placeholder={api.edit ? LINE_PLACEHOLDER[ln.t] : undefined}
          onChange={(e) => onInput(e, ln)} onKeyDown={(e) => onKey(e, ln, i)} onPaste={(e) => onPaste(e, ln, i)}
          onBlur={() => { if (slash?.lid === ln.id) setTimeout(() => setSlash((cur) => cur?.lid === ln.id ? null : cur), 120); }} />
      </div>;
    })}
    {slash && slashLine && menuActions(slashItems(slashLine, slash.q)).length > 0 && <Popover anchor={slash.anchor} onClose={() => setSlash(null)} wide role="presentation">
      <MenuList items={slashItems(slashLine, slash.q)} sel={slash.sel} onPick={(k) => menuActions(slashItems(slashLine, slash.q))[k]?.run()} />
    </Popover>}
  </div>;
}
