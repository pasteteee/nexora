"use client";
import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, Copy, FilePlus2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { IconButton, Menu, toast, type MenuItem } from "@/components/ui";
import { data } from "@/lib/data";
import { ago } from "@/lib/time";
import type { Canvas } from "@/lib/types";
import s from "./pages.module.css";

type Props = {
  workspaceId: string;
  current: string;
  pages: Canvas[];
  canEdit: boolean;
  onChange(): void;
  go(id: string): void;
};

/** Страницы тетради: перетаскивание для порядка, переименование по двойному клику, корзина */
export function PagesPanel({ workspaceId, current, pages, canEdit, onChange, go }: Props) {
  const [order, setOrder] = useState(pages);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [trash, setTrash] = useState<Canvas[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; y: number; started: boolean } | null>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => { if (!drag.current) setOrder(pages); }, [pages]);

  function onPointerDown(e: React.PointerEvent, id: string) {
    if (!canEdit || e.button !== 0 || renaming) return;
    drag.current = { id, y: e.clientY, started: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.started) {
      if (Math.abs(e.clientY - d.y) < 4) return;
      d.started = true;
      setDragId(d.id);
      list.current?.setPointerCapture(e.pointerId);
    }
    // строка меняется местами с соседом, когда курсор проходит его середину
    const rows = [...(list.current?.children ?? [])] as HTMLElement[];
    const target = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY >= b.top && e.clientY < b.bottom;
    });
    setOrder((o) => {
      const from = o.findIndex((p) => p.id === d.id);
      if (target < 0 || target === from) return o;
      const next = [...o];
      next.splice(target, 0, next.splice(from, 1)[0]);
      return next;
    });
  }
  async function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setDragId(null);
    if (!d?.started) return;
    if (order.map((p) => p.id).join() === pages.map((p) => p.id).join()) return;
    try { await data.reorderCanvases(workspaceId, order.map((p) => p.id)); } catch { toast("Не удалось сохранить порядок"); setOrder(pages); }
    onChange();
  }

  async function rename(id: string, name: string) {
    setRenaming(null);
    const v = name.trim().slice(0, 100);
    if (!v || v === pages.find((p) => p.id === id)?.name) return;
    setOrder((o) => o.map((p) => (p.id === id ? { ...p, name: v } : p)));
    await data.updateCanvas(id, { name: v });
    onChange();
  }

  async function addPage() {
    const c = await data.createCanvas(workspaceId);
    onChange();
    go(c.id);
  }

  async function toTrash(id: string) {
    const rest = order.filter((p) => p.id !== id);
    if (!rest.length) return toast("В тетради должна остаться хотя бы одна страница");
    await data.trashCanvas(id);
    toast("Страница в корзине", { label: "Вернуть", run: async () => { await data.restoreCanvas(id); onChange(); } });
    if (trash) setTrash(await data.listCanvasTrash(workspaceId));
    onChange();
    if (id === current) go(rest[0].id);
  }

  async function restore(id: string) {
    await data.restoreCanvas(id);
    setTrash((t) => t?.filter((p) => p.id !== id) ?? null);
    onChange();
  }

  function rowMenu(e: React.MouseEvent, p: Canvas) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: "Переименовать", icon: <Pencil size={16} />, onSelect: () => setRenaming(p.id) },
        { label: "Дублировать", icon: <Copy size={16} />, onSelect: async () => { const c = await data.duplicateCanvas(p.id); onChange(); go(c.id); } },
        { sep: true },
        { label: "В корзину", icon: <Trash2 size={16} />, danger: true, onSelect: () => toTrash(p.id) },
      ],
    });
  }

  return (
    <aside className={s.panel} aria-label="Страницы">
      <ol ref={list} className={s.list} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {order.map((p, i) => (
          <li
            key={p.id}
            className={s.row}
            aria-current={p.id === current ? "page" : undefined}
            data-dragging={p.id === dragId || undefined}
            onPointerDown={(e) => onPointerDown(e, p.id)}
            onClick={() => !dragId && renaming !== p.id && p.id !== current && go(p.id)}
            onDoubleClick={() => canEdit && setRenaming(p.id)}
            onContextMenu={(e) => canEdit && rowMenu(e, p)}
          >
            <span className={s.num}>{i + 1}</span>
            {renaming === p.id ? (
              <input
                className={s.rename}
                defaultValue={p.name}
                autoFocus
                maxLength={100}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => rename(p.id, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <span className={s.name}>{p.name}</span>
            )}
            {canEdit && renaming !== p.id && (
              <button className={s.more} aria-label="Действия" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => rowMenu(e, p)}>
                <MoreHorizontal size={16} />
              </button>
            )}
          </li>
        ))}
      </ol>

      {trash && (
        <div className={s.trash}>
          {trash.length === 0 && <div className={s.empty}><Trash2 size={18} /></div>}
          {trash.map((p) => (
            <div key={p.id} className={s.trashRow}>
              <span className={s.name}>{p.name}</span>
              <span className={s.when}>{p.deletedAt && ago(p.deletedAt)}</span>
              <IconButton tip="Восстановить" onClick={() => restore(p.id)}><ArchiveRestore size={16} /></IconButton>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className={s.foot}>
          <IconButton tip="Новая страница" onClick={addPage}><FilePlus2 size={18} /></IconButton>
          <IconButton tip="Корзина страниц" active={!!trash}
            onClick={async () => setTrash(trash ? null : await data.listCanvasTrash(workspaceId))}>
            <Trash2 size={18} />
          </IconButton>
        </div>
      )}
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}
