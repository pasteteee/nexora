"use client";
import { useState } from "react";
import { toast } from "@/components/ui";
import { data } from "@/lib/data";
import { insertImages, insertSources } from "@/lib/editor/actions";
import { useEditor } from "@/lib/editor/store";
import { NOTEBOOK_THEMES, type Canvas, type NotebookTheme } from "@/lib/types";
import { Board } from "./board/Board";
import { Popover } from "./board/Popover";
import { boardFonts } from "./board/fonts";
import b from "./board/board.module.css";
import s from "./document.module.css";

function PageTitle({ page, canEdit, onRenamed }: { page: Canvas; canEdit: boolean; onRenamed(): void }) {
  const [name, setName] = useState(page.name);
  async function save() {
    const value = name.trim();
    if (!value) { setName(page.name); return; }
    if (value === page.name) return;
    try { await data.updateCanvas(page.id, { name: value }); onRenamed(); }
    catch { toast("Не удалось сохранить название"); setName(page.name); }
  }
  if (!canEdit) return <h1 className={b.pageTitle}>{page.name}</h1>;
  return <input aria-label="Название страницы" className={b.pageTitle} value={name} maxLength={100}
    onChange={(e) => setName(e.target.value)} onBlur={() => void save()}
    onKeyDown={(e) => {
      if (e.key !== "Enter") return;
      e.preventDefault(); e.currentTarget.blur();
      // Enter in the title continues into the first line of the page.
      document.querySelector<HTMLElement>("[data-wid] [data-lid]")?.focus();
    }} />;
}

function ThemePicker({ theme, canChange, onChange }: { theme: NotebookTheme; canChange: boolean; onChange(t: NotebookTheme): void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <>
    <button type="button" className={b.btn} aria-haspopup="dialog" onClick={(e) => setAnchor(e.currentTarget)}>Тема</button>
    {anchor && <Popover anchor={anchor} onClose={() => setAnchor(null)} label="Тема тетради">
      <div className={b.themes}>
        <div className={b.themesH}>{canChange ? "Тема тетради: бумага, цвета и шрифт заголовков" : "Тему тетради меняет владелец"}</div>
        {NOTEBOOK_THEMES.map(([t, label]) => <button key={t} type="button" className={b.th} aria-pressed={t === theme} disabled={!canChange && t !== theme}
          onClick={() => canChange && onChange(t)}>
          <span className={b.pv} data-pv={t}><i /></span><span>{label}</span>
        </button>)}
      </div>
    </Popover>}
  </>;
}

/**
 * Page editor: a sheet of movable widgets in the notebook theme. Files dropped on the page become
 * images or materials; they appear at the end of the page.
 */
export function DocumentEditor({ page, theme, canTheme, onTheme, onRenamed, onOpenMaterials }: {
  page: Canvas; theme: NotebookTheme; canTheme: boolean; onTheme(t: NotebookTheme): void; onRenamed(): void; onOpenMaterials?(): void;
}) {
  const canEdit = useEditor((st) => st.canEdit);
  return <div className={`${s.editor} ${boardFonts}`} data-board-scroll
    onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
    onDrop={(e) => {
      if (!canEdit || !e.dataTransfer.files.length) return;
      e.preventDefault();
      const files = [...e.dataTransfer.files], images = files.filter((f) => f.type.startsWith("image/")), other = files.filter((f) => !f.type.startsWith("image/"));
      if (images.length) void insertImages(images, { x: 0, y: 0 });
      if (other.length) void insertSources(other, { x: 0, y: 0 });
    }}>
    <Board theme={theme} onOpenMaterials={onOpenMaterials}
      header={<PageTitle key={`${page.id}:${page.name}`} page={page} canEdit={canEdit} onRenamed={onRenamed} />}
      tools={<ThemePicker theme={theme} canChange={canTheme} onChange={onTheme} />} />
  </div>;
}
