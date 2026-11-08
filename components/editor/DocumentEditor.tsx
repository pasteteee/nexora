"use client";
import { useState, type ReactNode } from "react";
import { toast } from "@/components/ui";
import { data } from "@/lib/data";
import { insertImages, insertSources } from "@/lib/editor/actions";
import { useEditor } from "@/lib/editor/store";
import type { Canvas, NotebookTheme } from "@/lib/types";
import { Board } from "./board/Board";
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

/**
 * Page editor: a sheet of movable widgets in the notebook theme. Files dropped on the page become
 * images or materials; they appear at the end of the page.
 */
export function DocumentEditor({ page, notebook, theme, dock, onRenamed, onOpenMaterials }: {
  page: Canvas; notebook: string; theme: NotebookTheme; dock?: ReactNode; onRenamed(): void; onOpenMaterials?(): void;
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
      header={<>
        <div className={b.crumb}><span>{notebook}</span></div>
        <PageTitle key={`${page.id}:${page.name}`} page={page} canEdit={canEdit} onRenamed={onRenamed} />
      </>}
      dock={dock} />
  </div>;
}
