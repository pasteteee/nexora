"use client";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, PanelLeft, Plus, Sparkles } from "lucide-react";
import { toast } from "@/components/ui";
import { data } from "@/lib/data";
import { useEditor } from "@/lib/editor/store";
import { saveBeforeNavigation } from "@/lib/editor/autosave";
import { SaveIndicator } from "./SaveIndicator";
import { HistoryButtons } from "./HistoryButtons";
import { PagesPanel } from "./PagesPanel";
import { DocumentEditor } from "./DocumentEditor";
import { KnowledgePanel } from "@/components/knowledge/KnowledgePanel";
import { useUi } from "@/lib/editor/ui";
import type { Canvas, WorkspaceCard } from "@/lib/types";
import s from "./workspace.module.css";

function PageTitle({ page, canEdit, onChange }: { page: Canvas; canEdit: boolean; onChange(): void }) {
  const [name, setName] = useState(page.name);
  const [saving, setSaving] = useState(false);
  async function save() {
    const value = name.trim();
    if (!value) { setName(page.name); return; }
    if (value === page.name) return;
    setSaving(true);
    try { await data.updateCanvas(page.id, { name: value }); onChange(); }
    catch { toast("Не удалось сохранить название"); setName(page.name); }
    finally { setSaving(false); }
  }
  return <div className={s.titleArea}>
    {canEdit ? <input aria-label="Название страницы" className={s.titleInput} value={name} maxLength={100}
      onChange={(e) => setName(e.target.value)} onBlur={() => void save()}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      : <h1 className={s.titleInput}>{page.name}</h1>}
    <span className={s.titleHint} aria-live="polite">{saving ? "Сохраняем название…" : "Текст, заметки и материалы в одном документе"}</span>
  </div>;
}

export function EditorShell({ workspaceId, canvasId }: { workspaceId: string; canvasId: string }) {
  const router = useRouter();
  const [ws, setWs] = useState<WorkspaceCard | null>(null);
  const [pages, setPages] = useState<Canvas[]>([]);
  const [missing, setMissing] = useState(false);
  const [panel, setPanel] = useState(() => typeof window !== "undefined" && window.innerWidth >= 800);
  const [knowledge, setKnowledge] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1100);
  const [ready, setReady] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [navigating, setNavigating] = useState(false);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        await saveBeforeNavigation();
        const [w, list, c, els] = await Promise.all([
          data.getWorkspace(workspaceId), data.listCanvases(workspaceId), data.getCanvas(canvasId), data.listElements(canvasId),
        ]);
        if (!alive) return;
        if (!w || !c || c.workspaceId !== workspaceId || !list.some((p) => p.id === canvasId)) { setMissing(true); return; }
        useEditor.getState().init({ canvasId, canEdit: w.role !== "viewer", els,
          background: { type: c.backgroundType, spacing: c.backgroundSpacing } });
        useUi.setState({ workspaceId, tool: "select", editing: null });
        setWs(w); setPages(list); setLoadError(""); setReady(canvasId);
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "Не удалось открыть страницу");
      }
    }
    void load();
    return () => { alive = false; };
  }, [canvasId, workspaceId, retry]);
  async function refreshPages() {
    try { setPages(await data.listCanvases(workspaceId)); }
    catch { toast("Не удалось обновить список страниц"); }
  }
  async function navigate(url: string) {
    if (navigating) return;
    setNavigating(true);
    try { await saveBeforeNavigation(); router.push(url); }
    catch (error) { toast((error as Error).message); }
    finally { setNavigating(false); }
  }
  const go = (id: string) => { void navigate(`/app/w/${workspaceId}/p/${id}`); };
  async function addPage() {
    if (navigating) return;
    setNavigating(true);
    try {
      await saveBeforeNavigation();
      const page = await data.createCanvas(workspaceId);
      await refreshPages();
      router.push(`/app/w/${workspaceId}/p/${page.id}`);
    } catch (error) { toast((error as Error).message || "Не удалось создать страницу"); }
    finally { setNavigating(false); }
  }
  if (missing) notFound();
  const page = pages.find((p) => p.id === canvasId);
  const index = pages.findIndex((p) => p.id === canvasId);
  const canEdit = !!ws && ws.role !== "viewer";
  const isReady = ready === canvasId && !!page;
  return <main className={s.workspace}>
    <header className={s.header}>
      <div className={s.identity}>
        <button className={s.iconButton} onClick={() => void navigate("/app")} aria-label="Все тетради" title="Все тетради"><ArrowLeft size={18} /></button>
        <span className={s.brand}>Nexora<span /></span><span className={s.headerDivider} />
        <span className={s.notebookName}>{ws?.name ?? "Тетрадь"}</span>
      </div>
      <div className={s.headerActions}>
        <HistoryButtons /><SaveIndicator /><span className={s.headerDivider} />
        <button className={s.toggle} aria-label="Панель страниц" aria-pressed={panel} onClick={() => setPanel(!panel)}><PanelLeft size={17} /><span>Страницы</span></button>
        <button className={s.toggle} aria-label="Материалы и ИИ" aria-pressed={knowledge} onClick={() => setKnowledge(!knowledge)}><Sparkles size={17} /><span>Материалы и ИИ</span></button>
      </div>
    </header>
    <div className={s.layout} data-pages={panel} data-knowledge={knowledge}>
      {panel && ws && <div className={s.pagesDock}><PagesPanel workspaceId={workspaceId} current={canvasId} pages={pages} canEdit={canEdit}
        onChange={() => void refreshPages()} go={go} /></div>}
      <section className={s.document} aria-label="Документ">
        <div className={s.pageBar}>
          <div><FileText size={15} /><span>{page?.name ?? "Загрузка страницы…"}</span></div>
          <nav className={s.pageNavigation} aria-label="Переход между страницами">
            <span>{index >= 0 ? `${index + 1} / ${pages.length}` : ""}</span>
            <button aria-label="Предыдущая страница" disabled={navigating || index <= 0} onClick={() => go(pages[index - 1].id)}><ChevronLeft size={17} /></button>
            <button aria-label="Следующая страница" disabled={navigating || index < 0 || index >= pages.length - 1} onClick={() => go(pages[index + 1].id)}><ChevronRight size={17} /></button>
            {canEdit && <button aria-label="Добавить страницу" disabled={navigating} onClick={() => void addPage()}><Plus size={17} /></button>}
          </nav>
        </div>
        {loadError && !isReady ? <div className={s.loading} role="alert"><p>{loadError}</p><button onClick={() => setRetry((n) => n + 1)}>Повторить</button></div>
          : isReady ? <><PageTitle key={`${canvasId}:${page.name}`} page={page} canEdit={canEdit} onChange={() => void refreshPages()} />
            <DocumentEditor key={canvasId} title={page.name} /></> : <div className={s.loading} role="status">Открываем страницу…</div>}
      </section>
      {knowledge && ws && <div className={s.knowledgeDock}><KnowledgePanel key={canvasId} workspaceId={workspaceId} canvasId={canvasId} canEdit={canEdit} docked open={knowledge} onOpenChange={setKnowledge} /></div>}
    </div>
  </main>;
}
