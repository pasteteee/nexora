"use client";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, PanelLeft, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Group, IconButton, Sep } from "@/components/ui";
import { data } from "@/lib/data";
import { loadCamera, useEditor } from "@/lib/editor/store";
import { Canvas as CanvasView } from "./Canvas";
import { SaveIndicator } from "./SaveIndicator";
import { HistoryButtons } from "./HistoryButtons";
import { PagesPanel } from "./PagesPanel";
import { Toolbar } from "./Toolbar";
import { create, startEditing } from "@/lib/editor/actions";
import { useUi } from "@/lib/editor/ui";
import type { Canvas, WorkspaceCard } from "@/lib/types";
import s from "./editor.module.css";

/** Оболочка редактора: тетрадь, страницы и холст на весь экран */
export function EditorShell({ workspaceId, canvasId }: { workspaceId: string; canvasId: string }) {
  const router = useRouter();
  const [ws, setWs] = useState<WorkspaceCard | null>(null);
  const [pages, setPages] = useState<Canvas[]>([]);
  const [missing, setMissing] = useState(false);
  // открыта ли панель страниц — настройка пользователя (AuthGate рендерит редактор только в браузере)
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem("nexora:pages") !== "0"; } catch { return true; } });
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([data.getWorkspace(workspaceId), data.listCanvases(workspaceId)])
      .then(([w, list]) => {
        if (!alive) return;
        if (!w || !list.some((c) => c.id === canvasId)) return setMissing(true);
        setWs(w); setPages(list);
      })
      .catch(() => alive && setMissing(true));
    return () => { alive = false; };
  }, [workspaceId, canvasId, tick]);

  useEffect(() => {
    let alive = true;
    Promise.all([data.getCanvas(canvasId), data.listElements(canvasId), data.getWorkspace(workspaceId)])
      .then(([c, els, w]) => {
        if (!alive || !c || !w) return;
        useEditor.getState().init({
          canvasId, canEdit: w.role !== "viewer", els,
          background: { type: c.backgroundType, spacing: c.backgroundSpacing },
          camera: loadCamera(canvasId) ?? undefined,
        });
        useUi.setState({ workspaceId, tool: "select", editing: null });
        setReady(canvasId);
      })
      .catch(() => alive && setMissing(true));
    return () => { alive = false; };
  }, [canvasId, workspaceId]);

  if (missing) notFound();
  const page = pages.find((c) => c.id === canvasId);
  const canEdit = ws?.role !== "viewer";
  const go = (id: string) => router.push(`/app/w/${workspaceId}/p/${id}`);

  const index = pages.findIndex((p) => p.id === canvasId);

  function addText() {
    const items = Object.values(useEditor.getState().els);
    const y = Math.max(80, ...items.map((el) => el.y + el.height + 24));
    const el = create("text", { x: 0, y: y + 24 }, { width: 680, height: 48 });
    if (el) {
      const st = useEditor.getState();
      // New paragraphs must enter the viewport before receiving focus.
      const viewport = document.querySelector<HTMLElement>("[data-notebook-viewport]");
      const width = viewport?.clientWidth ?? 900;
      st.setCamera({ ...st.camera, x: width / 2, y: 100 - el.y * st.camera.zoom });
      startEditing(el.id);
    }
  }

  function togglePages() {
    setPanel((v) => { try { localStorage.setItem("nexora:pages", v ? "0" : "1"); } catch {} return !v; });
  }

  return (
    <main className={`${s.root} ${panel ? s.withPages : ""}`}>
      {ready === canvasId && <CanvasView key={canvasId} title={page?.name ?? "Страница"} />}
      <div className={s.tl}>
        <Group>
          <IconButton tip="Мои тетради" onClick={() => router.push("/app")}><Home size={18} /></IconButton>
          <Sep />
          <IconButton tip="Страницы" active={panel} onClick={togglePages}><PanelLeft size={18} /></IconButton>
          <button className={s.crumb} onClick={togglePages}>
            <span className={s.ws}>{ws?.name ?? "…"}</span>/<span>{page?.name ?? "…"}</span>
          </button>
        </Group>
      </div>
      <div className={s.tr}>
        <HistoryButtons />
        <Group><SaveIndicator /></Group>
      </div>
      <nav className={s.pageTabs} aria-label="Страницы тетради">
        <button aria-label="Предыдущая страница" disabled={index <= 0} onClick={() => go(pages[index - 1].id)}><ChevronLeft size={16} /></button>
        <div className={s.tabList}>{pages.map((p, i) => <button key={p.id} aria-current={p.id === canvasId ? "page" : undefined} onClick={() => go(p.id)}><span>{String(i + 1).padStart(2, "0")}</span>{p.name}</button>)}</div>
        <button aria-label="Следующая страница" disabled={index < 0 || index >= pages.length - 1} onClick={() => go(pages[index + 1].id)}><ChevronRight size={16} /></button>
        {canEdit && <button aria-label="Добавить страницу" onClick={async () => { const c = await data.createCanvas(workspaceId); setTick((t) => t + 1); go(c.id); }}><Plus size={16} /></button>}
      </nav>
      {ready === canvasId && canEdit && <button className={s.writeButton} onClick={addText}><Plus size={16} />Текст · Markdown</button>}
      {ready === canvasId && <Toolbar shifted={panel} />}
      {panel && ws && (
        <PagesPanel workspaceId={workspaceId} current={canvasId} pages={pages} canEdit={canEdit}
          onChange={() => setTick((t) => t + 1)} go={go} />
      )}
    </main>
  );
}
