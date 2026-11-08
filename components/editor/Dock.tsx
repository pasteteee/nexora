"use client";
import { useState } from "react";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, FilePlus2, Palette, PanelLeft, Plus, Redo2, Sparkles, Undo2 } from "lucide-react";
import { Dock, DockButton, DockCount, DockGroup, DockSep } from "@/components/ui/Dock";
import { CollabBar } from "@/components/collab/CollabBar";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useEditor } from "@/lib/editor/store";
import { useUi } from "@/lib/editor/ui";
import { NOTEBOOK_THEMES, type Canvas, type NotebookTheme, type Role } from "@/lib/types";
import { Popover } from "./board/Popover";
import { SaveIndicator } from "./SaveIndicator";
import b from "./board/board.module.css";

/** Event the photo import dialog listens to (photo of a formula, chart or text → widgets). */
export const PHOTO_IMPORT_EVENT = "nexora:photo-import";

function ThemeButton({ theme, canChange, onChange }: { theme: NotebookTheme; canChange: boolean; onChange(t: NotebookTheme): void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <>
    <DockButton icon={<Palette size={18} />} tip="Тема тетради" aria-haspopup="dialog" aria-expanded={!!anchor}
      onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} />
    {anchor && <Popover anchor={anchor} onClose={() => setAnchor(null)} label="Тема тетради">
      <div className={b.themes}>
        <div className={b.themesH}>{canChange ? "Бумага, цвета и шрифт заголовков всей тетради" : "Тему тетради меняет владелец"}</div>
        {NOTEBOOK_THEMES.map(([t, label]) => <button key={t} type="button" className={b.th} aria-pressed={t === theme} disabled={!canChange && t !== theme}
          onClick={() => canChange && onChange(t)}>
          <span className={b.pv} data-pv={t}><i /></span><span>{label}</span>
        </button>)}
      </div>
    </Popover>}
  </>;
}

/**
 * Bottom dock of the notebook editor: every action of the page in one row.
 * It renders inside the page (Board), so it follows the notebook theme.
 */
export function EditorDock(p: {
  workspaceId: string; workspaceName: string; role: Role; page: Canvas; pages: Canvas[]; index: number;
  canEdit: boolean; navigating: boolean; panel: boolean; knowledge: boolean;
  theme: NotebookTheme; canTheme: boolean;
  onBack(): void; onPanel(): void; onKnowledge(): void; go(id: string): void; addPage(): void; onTheme(t: NotebookTheme): void;
}) {
  const canUndo = useEditor((st) => st.past.length > 0), canRedo = useEditor((st) => st.future.length > 0);
  const gallery = useUi((st) => st.gallery);
  const { pages, index, navigating, canEdit } = p;
  return <Dock label="Панель тетради">
    <DockGroup label="Навигация">
      <DockButton icon={<ArrowLeft size={18} />} tip="Все тетради" onClick={p.onBack} disabled={navigating} />
      <DockButton icon={<PanelLeft size={18} />} tip="Список страниц" active={p.panel} onClick={p.onPanel} />
      <DockButton icon={<ChevronLeft size={18} />} tip="Предыдущая страница" disabled={navigating || index <= 0} onClick={() => p.go(pages[index - 1].id)} />
      <DockCount><span aria-label={`Страница ${index + 1} из ${pages.length}`}>{index + 1} / {pages.length}</span></DockCount>
      <DockButton icon={<ChevronRight size={18} />} tip="Следующая страница" disabled={navigating || index >= pages.length - 1} onClick={() => p.go(pages[index + 1].id)} />
      {canEdit && <DockButton icon={<FilePlus2 size={18} />} tip="Новая страница" disabled={navigating} onClick={p.addPage} />}
    </DockGroup>
    {canEdit && <><DockSep />
      <DockGroup label="Добавить">
        <DockButton primary icon={<Plus size={18} />} tip="Добавить виджет" label="Виджет" aria-haspopup="dialog" aria-expanded={!!gallery}
          onClick={(e) => useUi.setState({ gallery: gallery ? null : e.currentTarget })} />
        <DockButton icon={<Camera size={18} />} tip="Фото в тетрадь: формула, график или текст" onClick={() => window.dispatchEvent(new CustomEvent(PHOTO_IMPORT_EVENT))} />
        <ThemeButton theme={p.theme} canChange={p.canTheme} onChange={p.onTheme} />
      </DockGroup>
      <DockSep />
      <DockGroup label="История">
        <DockButton icon={<Undo2 size={18} />} tip="Отменить · Ctrl+Z" disabled={!canUndo} onClick={() => useEditor.getState().undo()} />
        <DockButton icon={<Redo2 size={18} />} tip="Повторить · Ctrl+Shift+Z" disabled={!canRedo} onClick={() => useEditor.getState().redo()} />
        <SaveIndicator />
      </DockGroup>
    </>}
    <DockSep />
    <DockGroup label="Материалы и доступ">
      <DockButton icon={<Sparkles size={18} />} tip="Материалы и ИИ" label="Материалы" active={p.knowledge} onClick={p.onKnowledge} />
      {canEdit && <ExportMenu page={p.page} compact />}
      <CollabBar workspaceId={p.workspaceId} workspaceName={p.workspaceName} role={p.role} canvasId={p.page.id} pageName={p.page.name} />
    </DockGroup>
  </Dock>;
}

/** Minimal dock while the page loads or fails to load: the way back stays in the same place. */
export function LoadingDock({ onBack }: { onBack(): void }) {
  return <Dock label="Панель тетради"><DockButton icon={<ArrowLeft size={18} />} tip="Все тетради" label="Все тетради" onClick={onBack} /></Dock>;
}
