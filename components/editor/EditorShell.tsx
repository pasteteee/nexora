"use client";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, Copy, Ellipsis, FileText, PanelLeft, Plus, Trash2 } from "lucide-react";
import { IconButton, Menu, Skeleton, toast, type MenuItem } from "@/components/ui";
import { DocEditor } from "@/components/doc/DocEditor";
import { data } from "@/lib/data";
import { fromElement } from "@/lib/doc/model";
import { useDoc } from "@/lib/doc/store";
import { flush } from "@/lib/editor/autosave";
import type { Canvas, WorkspaceCard } from "@/lib/types";
import { SaveIndicator } from "./SaveIndicator";
import { HistoryButtons } from "./HistoryButtons";
import s from "./editor.module.css";

const SIDEBAR_KEY = "nexora:sidebar";
const UNTITLED = "Без названия";

const onResize = (cb: () => void) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); };
function readSidebarPref() {
  if (typeof window === "undefined") return true;
  try { return localStorage.getItem(SIDEBAR_KEY) !== "0"; } catch { return true; }
}

/** Тетрадь: страницы слева, страница-документ справа */
export function EditorShell({ workspaceId, canvasId }: { workspaceId: string; canvasId: string }) {
  const router = useRouter();
  const [ws, setWs] = useState<WorkspaceCard | null>(null);
  const [pages, setPages] = useState<Canvas[]>([]);
  const [missing, setMissing] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [ready, setReady] = useState<string | null>(null);
  // панель страниц: на широком экране открыта по умолчанию и помнит выбор, на узком — выезжает поверх
  const wide = useSyncExternalStore(onResize, () => window.innerWidth >= 900, () => true);
  const [override, setOverride] = useState<boolean | null>(null);
  const side = override ?? (wide && readSidebarPref());
  const toggleSide = () => {
    try { if (wide) localStorage.setItem(SIDEBAR_KEY, side ? "0" : "1"); } catch {}
    setOverride(!side);
  };

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
  }, [workspaceId, canvasId]);

  useEffect(() => {
    let alive = true;
    Promise.all([data.listElements(canvasId), data.getWorkspace(workspaceId)])
      .then(([els, w]) => {
        if (!alive || !w) return;
        useDoc.getState().init({ pageId: canvasId, canEdit: w.role !== "viewer", blocks: els.map(fromElement) });
        setReady(canvasId);
      })
      .catch(() => alive && setMissing(true));
    return () => { alive = false; flush(); };
  }, [canvasId, workspaceId]);

  if (missing) notFound();
  const page = pages.find((c) => c.id === canvasId);
  const canEdit = !!ws && ws.role !== "viewer";
  const go = (id: string) => {
    if (!wide) setOverride(false);
    router.push(`/app/w/${workspaceId}/p/${id}`);
  };

  async function addPage() {
    const c = await data.createCanvas(workspaceId, UNTITLED);
    setPages((p) => [...p, c]);
    go(c.id);
  }

  async function trashPage(id: string) {
    const rest = pages.filter((c) => c.id !== id);
    if (!rest.length) return toast("Последнюю страницу удалить нельзя");
    await data.trashCanvas(id);
    setPages(rest);
    toast("Страница в корзине", {
      label: "Вернуть",
      run: async () => { await data.restoreCanvas(id); setPages(await data.listCanvases(workspaceId)); go(id); },
    });
    if (id === canvasId) go(rest[0].id);
  }

  function pageMenu(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({
      x: e.type === "contextmenu" ? e.clientX : r.left, y: e.type === "contextmenu" ? e.clientY : r.bottom + 4,
      items: [
        { label: "Дублировать", icon: <Copy size={16} />, onSelect: async () => { await flush(); const c = await data.duplicateCanvas(id); setPages(await data.listCanvases(workspaceId)); go(c.id); } },
        { sep: true },
        { label: "В корзину", icon: <Trash2 size={16} />, danger: true, onSelect: () => trashPage(id) },
      ],
    });
  }

  function rename(name: string) {
    setPages((list) => list.map((c) => (c.id === canvasId ? { ...c, name: name || UNTITLED } : c)));
  }

  return (
    <div className={s.app} data-side={side ? "" : undefined}>
      <aside className={s.side} aria-label="Страницы тетради" aria-hidden={!side || undefined}>
        <Link href="/app" className={s.back}><ChevronLeft size={16} /> Все тетради</Link>
        <div className={s.wsName} title={ws?.name}>{ws?.name ?? <Skeleton w="70%" h={18} />}</div>
        <PageList
          pages={pages}
          current={canvasId}
          canEdit={canEdit}
          onOpen={go}
          onMenu={pageMenu}
          onReorder={(ids) => {
            setPages((list) => ids.map((id) => list.find((c) => c.id === id)!));
            data.reorderCanvases(workspaceId, ids).catch(() => toast("Не удалось сохранить порядок страниц"));
          }}
        />
        {canEdit && <button type="button" className={s.addPage} onClick={addPage}><Plus size={16} /> Новая страница</button>}
      </aside>
      {side && <div className={s.scrim} onClick={toggleSide} aria-hidden />}

      <div className={s.main}>
        <header className={s.top}>
          <IconButton tip={side ? "Скрыть страницы" : "Показать страницы"} onClick={toggleSide} active={!!side}><PanelLeft size={18} /></IconButton>
          <nav className={s.crumbs} aria-label="Путь">
            <Link href="/app" className={s.crumbWs}>{ws?.name ?? "…"}</Link>
            <span aria-hidden>/</span>
            <span className={s.crumbPage}>{page?.name ?? "…"}</span>
          </nav>
          <div className={s.topRight}>
            <SaveIndicator />
            <HistoryButtons />
            {canEdit && <IconButton tip="Действия со страницей" onClick={(e) => pageMenu(e, canvasId)}><Ellipsis size={18} /></IconButton>}
          </div>
        </header>

        <main className={s.paper}>
          {ready === canvasId && page ? (
            <>
              <Title key={canvasId} pageId={canvasId} name={page.name} canEdit={canEdit} onRename={rename} />
              <DocEditor
                empty={canEdit
                  ? <button type="button" className={s.start} onClick={() => useDoc.getState().insertAfter(null)}>Начните писать или введите «/», чтобы выбрать блок</button>
                  : <p className={s.start}>Страница пока пустая</p>}
              />
            </>
          ) : (
            <div className={s.loading} aria-label="Загрузка страницы">
              <Skeleton w="55%" h={40} />
              <Skeleton w="92%" h={18} />
              <Skeleton w="80%" h={18} />
              <Skeleton w="86%" h={18} />
            </div>
          )}
        </main>
      </div>
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

/* ---------- заголовок страницы = её название ---------- */

function Title({ pageId, name, canEdit, onRename }: { pageId: string; name: string; canEdit: boolean; onRename: (n: string) => void }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (ref.current) ref.current.textContent = name === UNTITLED ? "" : name;
    // название задаётся при открытии страницы, дальше его ведёт поле
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function onInput() {
    const v = (ref.current?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!v && ref.current?.innerHTML) ref.current.innerHTML = "";
    onRename(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      data.updateCanvas(pageId, { name: v || UNTITLED }).catch(() => toast("Не удалось переименовать страницу"));
    }, 500);
  }

  return (
    <h1
      ref={ref}
      className={s.title}
      contentEditable={canEdit ? "plaintext-only" : false}
      suppressContentEditableWarning
      data-ph={UNTITLED}
      aria-label="Название страницы"
      spellCheck
      onInput={onInput}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const st = useDoc.getState();
        const first = st.items[0];
        const id = first?.type === "block" ? first.id : first?.cols[0].ids[0];
        if (id && st.blocks[id]?.kind !== "divider") st.focusBlock(id, "start");
        else if (canEdit) st.insertAfter(null);
      }}
    />
  );
}

/* ---------- список страниц с перетаскиванием ---------- */

function PageList({ pages, current, canEdit, onOpen, onMenu, onReorder }: {
  pages: Canvas[];
  current: string;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);

  if (!pages.length) return <div className={s.pages}><Skeleton h={28} /><Skeleton h={28} w="80%" /></div>;

  return (
    <ul className={s.pages}>
      {pages.map((c) => (
        <li
          key={c.id}
          className={s.pageRow}
          data-active={c.id === current ? "" : undefined}
          data-drop={over?.id === c.id ? (over.after ? "after" : "before") : undefined}
          data-lifted={drag === c.id ? "" : undefined}
          draggable={canEdit}
          onDragStart={(e) => { setDrag(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.name); }}
          onDragOver={(e) => {
            if (!drag || drag === c.id) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setOver({ id: c.id, after: e.clientY > r.top + r.height / 2 });
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            if (!drag || !over) return;
            const ids = pages.map((p) => p.id).filter((id) => id !== drag);
            ids.splice(ids.indexOf(over.id) + (over.after ? 1 : 0), 0, drag);
            onReorder(ids);
            setOver(null);
          }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          onContextMenu={(e) => canEdit && onMenu(e, c.id)}
        >
          <button type="button" className={s.pageLink} onClick={() => onOpen(c.id)} aria-current={c.id === current ? "page" : undefined}>
            <FileText size={16} strokeWidth={1.75} />
            <span>{c.name}</span>
          </button>
          {canEdit && (
            <button type="button" className={s.pageMore} aria-label={`Действия: ${c.name}`} onClick={(e) => onMenu(e, c.id)}>
              <Ellipsis size={16} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
