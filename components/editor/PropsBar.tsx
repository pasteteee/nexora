"use client";
import { useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowUpRight, BringToFront, Circle, Diamond, Group as GroupIcon, Bold, Italic,
  Minus, MoreHorizontal, Pencil, SendToBack, Square, Strikethrough, Trash2, Triangle, Underline, Ungroup,
} from "lucide-react";
import { Group, IconButton, Sep } from "@/components/ui";
import { arrangeZ, deleteSelection, groupSelection, setContent, setStyle, startEditing, ungroupSelection, withGroups } from "@/lib/editor/actions";
import { rectOf } from "@/lib/editor/connector";
import { bbox, toScreen } from "@/lib/editor/geometry";
import { useEditor } from "@/lib/editor/store";
import { COLORS, FONT_SIZES, STROKES, fillOf, strokeOf, type TextStyle } from "@/lib/editor/styles";
import { useUi } from "@/lib/editor/ui";
import type { CanvasElement } from "@/lib/types";
import s from "./editor.module.css";

const TEXTUAL = new Set(["text", "note", "shape", "diagram_node"]);
const SHAPES = [
  { kind: "rect", icon: <Square size={16} /> }, { kind: "ellipse", icon: <Circle size={16} /> },
  { kind: "diamond", icon: <Diamond size={16} /> }, { kind: "triangle", icon: <Triangle size={16} /> },
];
const ALIGN = { left: <AlignLeft size={16} />, center: <AlignCenter size={16} />, right: <AlignRight size={16} /> };
const NEXT_ALIGN = { left: "center", center: "right", right: "left" } as const;

/** Палитра в выпадающей «пилюле» под кнопкой */
function Palette({ tip, value, options, render, onPick }: {
  tip: string; value: unknown; options: readonly string[]; render(v: string): React.ReactNode; onPick(v: string): void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className={s.anchor}>
      <IconButton tip={tip} active={open} onClick={() => setOpen(!open)}>{render(String(value))}</IconButton>
      {open && (
        <div className={s.palette} onPointerLeave={() => setOpen(false)}>
          {options.map((o) => (
            <button key={o} aria-label={o} aria-pressed={o === value} onClick={() => { onPick(o); setOpen(false); }}>{render(o)}</button>
          ))}
        </div>
      )}
    </span>
  );
}

const dot = (c: string) => <span className={`${s.dot} ${c === "none" ? s.dotNone : ""}`} style={{ background: c === "none" ? undefined : fillOf(c) }} />;
const ring = (c: string) => <span className={`${s.ring} ${c === "none" ? s.dotNone : ""}`} style={{ borderColor: strokeOf(c) }} />;

/** Панель свойств над выделением — появляется только при наличии выделения (ТЗ 4.4) */
export function PropsBar({ onMore }: { onMore(x: number, y: number): void }) {
  const selected = useEditor((st) => st.selected);
  const els = useEditor((st) => st.els);
  const camera = useEditor((st) => st.camera);
  const canEdit = useEditor((st) => st.canEdit);
  const editing = useUi((u) => u.editing);
  const items = selected.map((id) => els[id]).filter(Boolean) as CanvasElement[];
  if (!canEdit || !items.length) return null;

  const box = bbox(items.map((e) => rectOf(e, els)))!;
  const tl = toScreen(box, camera);
  const w = box.width * camera.zoom;
  const above = tl.y - 60 > 64;
  const pos = { left: Math.min(Math.max(tl.x + w / 2, 200), window.innerWidth - 200), top: above ? tl.y - 56 : tl.y + box.height * camera.zoom + 14 };

  const types = new Set(items.map((e) => e.type));
  const only = (t: string) => types.size === 1 && types.has(t as CanvasElement["type"]);
  const first = items[0];
  const fs = first.style as TextStyle & Record<string, unknown>;
  const textual = items.every((e) => TEXTUAL.has(e.type));
  const grouped = withGroups(selected).some((e) => e.type === "group");
  const isText = (e: CanvasElement) => TEXTUAL.has(e.type) || e.type === "formula";

  return (
    <div className={s.props} style={pos} onPointerDown={(e) => e.stopPropagation()}>
      <Group>
        {(only("note") || only("diagram_node")) && (
          <Palette tip="Цвет" value={fs.color ?? "yellow"} options={COLORS} render={dot} onPick={(c) => setStyle({ color: c })} />
        )}
        {only("shape") && (
          <>
            {SHAPES.map((sh) => (
              <IconButton key={sh.kind} tip="Форма" active={first.content.kind === sh.kind} onClick={() => setContent({ kind: sh.kind })}>{sh.icon}</IconButton>
            ))}
            <Sep />
            <Palette tip="Заливка" value={fs.fill ?? "blue"} options={[...COLORS, "none"]} render={dot} onPick={(c) => setStyle({ fill: c })} />
            <Palette tip="Обводка" value={fs.stroke ?? "ink"} options={STROKES} render={ring} onPick={(c) => setStyle({ stroke: c })} />
          </>
        )}
        {only("connector") && (
          <>
            <Palette tip="Цвет линии" value={fs.stroke ?? "ink"} options={STROKES.filter((x) => x !== "none")} render={ring} onPick={(c) => setStyle({ stroke: c })} />
            <IconButton tip="Стрелка" active={fs.arrow !== "none"} onClick={() => setStyle({ arrow: fs.arrow === "none" ? "end" : "none" })}><ArrowUpRight size={16} /></IconButton>
            <IconButton tip="Пунктир" active={fs.dash === true} onClick={() => setStyle({ dash: !fs.dash })}><Minus size={16} strokeDasharray="4 3" /></IconButton>
          </>
        )}
        {(textual || only("formula")) && (
          <>
            {types.size === 1 && !only("text") && !only("connector") && <Sep />}
            <select className={s.size} aria-label="Размер текста" value={fs.fontSize ?? 16}
              onChange={(e) => setStyle({ fontSize: Number(e.target.value) }, isText)}>
              {FONT_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </>
        )}
        {textual && (
          <>
            <IconButton tip="Полужирный" active={!!fs.bold} onClick={() => setStyle({ bold: !fs.bold })}><Bold size={16} /></IconButton>
            <IconButton tip="Курсив" active={!!fs.italic} onClick={() => setStyle({ italic: !fs.italic })}><Italic size={16} /></IconButton>
            <IconButton tip="Подчёркнутый" active={!!fs.underline} onClick={() => setStyle({ underline: !fs.underline })}><Underline size={16} /></IconButton>
            <IconButton tip="Зачёркнутый" active={!!fs.strike} onClick={() => setStyle({ strike: !fs.strike })}><Strikethrough size={16} /></IconButton>
            <IconButton tip="Выравнивание" onClick={() => setStyle({ align: NEXT_ALIGN[fs.align ?? "left"] })}>{ALIGN[fs.align ?? "left"]}</IconButton>
          </>
        )}
        {items.length === 1 && (isText(first)) && editing !== first.id && (
          <IconButton tip="Редактировать  Enter" onClick={() => startEditing(first.id)}><Pencil size={16} /></IconButton>
        )}
        {(textual || only("shape") || only("connector") || only("formula") || only("note")) && <Sep />}
        {items.length > 1 && !grouped && <IconButton tip="Сгруппировать  Ctrl+G" onClick={groupSelection}><GroupIcon size={16} /></IconButton>}
        {grouped && <IconButton tip="Разгруппировать  Ctrl+Shift+G" onClick={ungroupSelection}><Ungroup size={16} /></IconButton>}
        <IconButton tip="На передний план  Ctrl+]" onClick={() => arrangeZ("front")}><BringToFront size={16} /></IconButton>
        <IconButton tip="На задний план  Ctrl+[" onClick={() => arrangeZ("back")}><SendToBack size={16} /></IconButton>
        <IconButton tip="Удалить  Del" onClick={deleteSelection}><Trash2 size={16} /></IconButton>
        <IconButton tip="Ещё" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMore(r.left, r.bottom + 8); }}><MoreHorizontal size={16} /></IconButton>
      </Group>
    </div>
  );
}
