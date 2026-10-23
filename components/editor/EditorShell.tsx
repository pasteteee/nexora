"use client";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Copy, FilePlus2, Home, Pencil, Trash2 } from "lucide-react";
import { Group, IconButton, Menu, Sep, toast, type MenuItem } from "@/components/ui";
import { data } from "@/lib/data";
import { loadCamera, useEditor } from "@/lib/editor/store";
import { Canvas as CanvasView } from "./Canvas";
import { SaveIndicator } from "./SaveIndicator";
import { HistoryButtons } from "./HistoryButtons";
import type { Canvas, WorkspaceCard } from "@/lib/types";
import s from "./editor.module.css";

/** Оболочка редактора: тетрадь, страницы и холст на весь экран */
export function EditorShell({ workspaceId, canvasId }: { workspaceId: string; canvasId: string }) {
  const router = useRouter();
  const [ws, setWs] = useState<WorkspaceCard | null>(null);
  const [pages, setPages] = useState<Canvas[]>([]);
  const [missing, setMissing] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
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

  async function addPage() {
    const c = await data.createCanvas(workspaceId);
    go(c.id);
  }

  function pagesMenu(e: React.MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({
      x: r.left, y: r.bottom + 8,
      items: [
        ...pages.map((c): MenuItem => ({ label: c.name, onSelect: () => go(c.id) })),
        { sep: true },
        { label: "Новая страница", icon: <FilePlus2 size={16} />, onSelect: addPage, hidden: !canEdit },
        { label: "Дублировать", icon: <Copy size={16} />, hidden: !canEdit, onSelect: async () => go((await data.duplicateCanvas(canvasId)).id) },
        { label: "Переименовать", icon: <Pencil size={16} />, hidden: !canEdit, onSelect: async () => {
          const name = prompt("Название страницы", page?.name)?.trim();
          if (name) { await data.updateCanvas(canvasId, { name: name.slice(0, 100) }); setTick((t) => t + 1); }
        } },
        { label: "В корзину", icon: <Trash2 size={16} />, danger: true, hidden: !canEdit || pages.length < 2, onSelect: async () => {
          await data.trashCanvas(canvasId);
          toast("Страница в корзине", { label: "Отменить", run: async () => { await data.restoreCanvas(canvasId); go(canvasId); } });
          go(pages.find((c) => c.id !== canvasId)!.id);
        } },
      ],
    });
  }

  return (
    <main className={s.root}>
      {ready === canvasId && <CanvasView />}
      <div className={s.tl}>
        <Group>
          <IconButton tip="Мои тетради" onClick={() => router.push("/app")}><Home size={18} /></IconButton>
          <Sep />
          <button className={s.crumb} onClick={pagesMenu}>
            <span className={s.ws}>{ws?.name ?? "…"}</span>/<span>{page?.name ?? "…"}</span><ChevronDown size={14} />
          </button>
          {canEdit && <IconButton tip="Новая страница" onClick={addPage}><FilePlus2 size={18} /></IconButton>}
        </Group>
      </div>
      <div className={s.tr}>
        <HistoryButtons />
        <Group><SaveIndicator /></Group>
      </div>
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </main>
  );
}
