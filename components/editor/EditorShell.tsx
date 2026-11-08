"use client";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui";
import { data } from "@/lib/data";
import { useEditor } from "@/lib/editor/store";
import { saveBeforeNavigation } from "@/lib/editor/autosave";
import { usePageRealtime } from "@/lib/realtime";
import { PresenceCursors } from "@/components/collab/PresenceCursors";
import { EditorDock, LoadingDock } from "./Dock";
import { PagesPanel } from "./PagesPanel";
import { DocumentEditor } from "./DocumentEditor";
import { KnowledgePanel } from "@/components/knowledge/KnowledgePanel";
import { useUi } from "@/lib/editor/ui";
import type { Canvas, NotebookTheme, WorkspaceCard } from "@/lib/types";
import s from "./workspace.module.css";

export function EditorShell({ workspaceId, canvasId }: { workspaceId: string; canvasId: string }) {
  const router = useRouter();
  const [ws, setWs] = useState<WorkspaceCard | null>(null);
  const [pages, setPages] = useState<Canvas[]>([]);
  const [missing, setMissing] = useState(false);
  const [panel, setPanel] = useState(() => typeof window !== "undefined" && window.innerWidth >= 800);
  const [knowledge, setKnowledge] = useState(false);
  const [ready, setReady] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [navigating, setNavigating] = useState(false);
  // совместная работа: объекты других участников, presence и смена роли (вид не меняется)
  const live = usePageRealtime(ready === canvasId ? canvasId : null, workspaceId);
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
        useUi.setState({ workspaceId, tool: "select", editing: null, gallery: null });
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
  async function changeTheme(theme: NotebookTheme) {
    if (!ws || ws.theme === theme) return;
    const before = ws.theme;
    setWs({ ...ws, theme });
    try { await data.setWorkspaceTheme(ws.id, theme); }
    catch { toast("Не удалось сменить тему тетради"); setWs((cur) => cur && { ...cur, theme: before }); }
  }
  if (missing) notFound();
  const page = pages.find((p) => p.id === canvasId);
  const index = pages.findIndex((p) => p.id === canvasId);
  // Роль может смениться во время работы (владелец ограничил доступ) — берём живую
  const role = live.role ?? ws?.role;
  const canEdit = !!ws && !!role && role !== "viewer";
  const isReady = ready === canvasId && !!page;
  const dock = ws && page ? <EditorDock workspaceId={workspaceId} workspaceName={ws.name} role={role ?? ws.role} page={page} pages={pages} index={index}
    canEdit={canEdit} navigating={navigating} panel={panel} knowledge={knowledge} theme={ws.theme ?? "clean"} canTheme={role === "owner"}
    onBack={() => void navigate("/app")} onPanel={() => setPanel(!panel)} onKnowledge={() => setKnowledge(!knowledge)}
    go={go} addPage={() => void addPage()} onTheme={(t) => void changeTheme(t)} /> : null;
  return <main className={s.workspace}>
    <div className={s.layout} data-pages={panel} data-knowledge={knowledge}>
      {panel && ws && <div className={s.pagesDock}><PagesPanel workspaceId={workspaceId} current={canvasId} pages={pages} canEdit={canEdit}
        onChange={() => void refreshPages()} go={go} /></div>}
      <section className={s.document} aria-label="Документ">
        {isReady && <PresenceCursors canvasId={canvasId} />}
        {loadError && !isReady ? <div className={s.loading} role="alert"><p>{loadError}</p><button onClick={() => setRetry((n) => n + 1)}>Повторить</button></div>
          : isReady ? <DocumentEditor key={canvasId} page={page} notebook={ws?.name ?? "Тетрадь"} theme={ws?.theme ?? "clean"} dock={dock}
            onRenamed={() => void refreshPages()} onOpenMaterials={() => setKnowledge(true)} /> : <div className={s.loading} role="status">Открываем страницу…</div>}
        {!isReady && <LoadingDock onBack={() => void navigate("/app")} />}
      </section>
      {knowledge && ws && <div className={s.knowledgeDock}><KnowledgePanel key={canvasId} workspaceId={workspaceId} canvasId={canvasId} canEdit={canEdit} docked open={knowledge} onOpenChange={setKnowledge} /></div>}
    </div>
  </main>;
}
