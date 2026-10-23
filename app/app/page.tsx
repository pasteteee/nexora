"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArchiveRestore, Ellipsis, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, IconButton, Menu, Skeleton, toast, type MenuItem } from "@/components/ui";
import s from "@/components/notebooks/notebooks.module.css";
import { data, ApiError } from "@/lib/data";
import { useSession } from "@/lib/session";
import { ago, daysLeft } from "@/lib/time";
import { TRASH_DAYS, type WorkspaceCard } from "@/lib/types";
import { validateTitle } from "@/lib/validation";

const COVERS = ["kraft", "ink", "bottle", "oxblood", "graphite", "mustard"];
/** Цвет обложки — стабильный по id тетради */
function cover(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return `var(--cover-${COVERS[(h >>> 0) % COVERS.length]})`;
}

const ROLE = { owner: null, editor: "редактор", viewer: "читатель" } as const;
const pages = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "страница" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "страницы" : "страниц"}`;

export default function Notebooks() {
  const router = useRouter();
  const { profile, signOut } = useSession();
  const [trash, setTrash] = useState(false);
  const [list, setList] = useState<WorkspaceCard[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    (trash ? data.listTrash() : data.listWorkspaces())
      .then((l) => alive && setList(l))
      .catch((e) => {
        if (!alive) return;
        toast(e instanceof ApiError ? e.message : "Не удалось загрузить тетради", { label: "Повторить", run: () => setTick((t) => t + 1) });
        setList([]);
      });
    return () => { alive = false; };
  }, [trash, tick]);

  async function create() {
    const ws = await data.createWorkspace();
    router.push(`/app/w/${ws.id}`);
  }
  async function rename(ws: WorkspaceCard, name: string) {
    setRenaming(null);
    if (validateTitle(name) || name.trim() === ws.name) return;
    setList((l) => l?.map((x) => (x.id === ws.id ? { ...x, name: name.trim() } : x)) ?? null);
    await data.renameWorkspace(ws.id, name).catch(() => { toast("Не удалось переименовать"); load(); });
  }
  async function toTrash(ws: WorkspaceCard) {
    setList((l) => l?.filter((x) => x.id !== ws.id) ?? null);
    await data.trashWorkspace(ws.id);
    toast("Тетрадь в корзине", { label: "Отменить", run: async () => { await data.restoreWorkspace(ws.id); load(); } });
  }
  async function restore(ws: WorkspaceCard) {
    setList((l) => l?.filter((x) => x.id !== ws.id) ?? null);
    await data.restoreWorkspace(ws.id);
    toast("Тетрадь восстановлена");
  }

  function openMenu(e: React.MouseEvent, ws: WorkspaceCard) {
    e.preventDefault(); e.stopPropagation();
    const owner = ws.role === "owner";
    setMenu({
      x: e.clientX, y: e.clientY,
      items: trash
        ? [{ label: "Восстановить", icon: <ArchiveRestore size={16} />, onSelect: () => restore(ws) }]
        : [
            { label: "Переименовать", icon: <Pencil size={16} />, onSelect: () => setRenaming(ws.id), hidden: !owner },
            { sep: true },
            { label: "В корзину", icon: <Trash2 size={16} />, danger: true, onSelect: () => toTrash(ws), hidden: !owner },
          ],
    });
  }

  const initials = (profile?.displayName || profile?.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className={s.page}>
      <header className={s.bar}>
        <span className={s.brand}>Nexora</span>
        <button
          type="button"
          className={s.profile}
          aria-label="Профиль"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.right - 220, y: r.bottom + 6, items: [
              { heading: profile?.email ?? "" },
              { label: "Выйти", icon: <LogOut size={16} />, onSelect: async () => { await signOut(); router.replace("/login"); } },
            ] });
          }}
        >
          <span className={s.avatar}>{initials}</span>
          <span className={s.who}>{profile?.displayName || profile?.email}</span>
        </button>
      </header>

      <main className={s.wrap}>
        <div className={s.head}>
          <h1 className={s.h1}>{trash ? "Корзина" : "Тетради"}</h1>
          {!trash && <Button onClick={create}><Plus size={16} /> Новая тетрадь</Button>}
        </div>
        <div className={s.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={!trash} onClick={() => { if (trash) { setList(null); setTrash(false); } }}>Мои тетради</button>
          <button type="button" role="tab" aria-selected={trash} onClick={() => { if (!trash) { setList(null); setTrash(true); } }}>Корзина</button>
        </div>

        {list === null && (
          <ul className={s.list} aria-busy>
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className={s.row}><span className={s.spine} style={{ background: "var(--surface-2)" }} /><div className={s.text}><Skeleton h={18} w="45%" /><div style={{ height: 6 }} /><Skeleton h={13} w="25%" /></div></li>
            ))}
          </ul>
        )}

        {list?.length === 0 && (
          <div className={s.empty}>
            <b>{trash ? "Корзина пуста" : "Пока ни одной тетради"}</b>
            <p>{trash ? `Удалённые тетради хранятся здесь ${TRASH_DAYS} дней.` : "Заведите тетрадь под предмет: внутри — страницы-конспекты."}</p>
            {!trash && <Button onClick={create}><Plus size={16} /> Новая тетрадь</Button>}
          </div>
        )}

        {list && list.length > 0 && (
          <ul className={s.list}>
            {list.map((ws) => (
              <li
                key={ws.id}
                className={s.row}
                data-trash={trash ? "" : undefined}
                onClick={() => !trash && renaming !== ws.id && router.push(`/app/w/${ws.id}`)}
                onContextMenu={(e) => openMenu(e, ws)}
              >
                <span className={s.spine} style={{ background: cover(ws.id) }} aria-hidden />
                <div className={s.text}>
                  {renaming === ws.id ? (
                    <input
                      className={s.rename}
                      defaultValue={ws.name}
                      maxLength={100}
                      autoFocus
                      aria-label="Название тетради"
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => rename(ws, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : trash ? (
                    <span className={s.name}>{ws.name}</span>
                  ) : (
                    <a className={s.name} href={`/app/w/${ws.id}`} onClick={(e) => e.preventDefault()}>{ws.name}</a>
                  )}
                  <div className={s.meta}>
                    {trash ? (
                      <span className={s.trashNote}>удалится через {daysLeft(ws.deletedAt!, TRASH_DAYS)} дн.</span>
                    ) : (
                      <>
                        <span>{pages(ws.pageCount)}</span>
                        <span>изменена {ago(ws.updatedAt)}</span>
                        {ROLE[ws.role] && <span className={s.role}>{ROLE[ws.role]}</span>}
                      </>
                    )}
                  </div>
                </div>
                <div className={s.more} onClick={(e) => e.stopPropagation()}>
                  {trash
                    ? <Button variant="secondary" onClick={() => restore(ws)}><ArchiveRestore size={15} /> Восстановить</Button>
                    : ws.role === "owner" && <IconButton tip="Действия" onClick={(e) => openMenu(e, ws)}><Ellipsis size={18} /></IconButton>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
