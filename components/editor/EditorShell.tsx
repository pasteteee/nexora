"use client";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, PanelLeft } from "lucide-react";
import { Group, IconButton, Sep } from "@/components/ui";
import { data } from "@/lib/data";
import { loadCamera, useEditor } from "@/lib/editor/store";
import { Canvas as CanvasView } from "./Canvas";
import { SaveIndicator } from "./SaveIndicator";
import { HistoryButtons } from "./HistoryButtons";
import { PagesPanel } from "./PagesPanel";
import type { Canvas, WorkspaceCard } from "@/lib/types";
import s from "./editor.module.css";

/** Оболочка редактора: тетрадь, страницы и холст на весь экран */
export function EditorShell({ workspaceId, canvasId }: { workspaceId: string; canvasId: string }) {
  const router = useRouter();
  const [ws, setWs] = useState<WorkspaceCard | null>(null);
  const [pages, setPages] = useState<Canvas[]>([]);
  const [missing, setMissing] = useState(false);
  // открыта ли панель страниц — настройка пользователя (AuthGate рендерит редактор только в браузере)
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem("nexora:pages") === "1"; } catch { return false; } });
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
        setReady(canvasId);
      })
      .catch(() => alive && setMissing(true));
    return () => { alive = false; };
  }, [canvasId, workspaceId]);

  if (missing) notFound();
  const page = pages.find((c) => c.id === canvasId);
  const canEdit = ws?.role !== "viewer";
  const go = (id: string) => router.push(`/app/w/${workspaceId}/p/${id}`);

  function togglePages() {
    setPanel((v) => { try { localStorage.setItem("nexora:pages", v ? "0" : "1"); } catch {} return !v; });
  }

  return (
    <main className={s.root}>
      {ready === canvasId && <CanvasView />}
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
      {panel && ws && (
        <PagesPanel workspaceId={workspaceId} current={canvasId} pages={pages} canEdit={canEdit}
          onChange={() => setTick((t) => t + 1)} go={go} />
      )}
    </main>
  );
}
