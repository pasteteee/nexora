"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArchiveRestore, Clock, FileStack, LogOut, MoreHorizontal, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Button, Group, IconButton, Menu, Sep, Skeleton, toast, type MenuItem } from "@/components/ui";
import { Cover } from "@/components/notebooks/Cover";
import s from "@/components/notebooks/notebooks.module.css";
import { data, ApiError } from "@/lib/data";
import { useSession } from "@/lib/session";
import { ago, daysLeft } from "@/lib/time";
import { TRASH_DAYS, type WorkspaceCard } from "@/lib/types";
import { validateTitle } from "@/lib/validation";

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
    <main className={s.page}>
      <header className={s.bar}>
        <Group><span className={s.brand}><span className={s.mark} />Nexora</span></Group>
        <Group>
          <IconButton tip="Новая тетрадь" onClick={create} disabled={trash}><Plus size={18} /></IconButton>
          <IconButton tip={trash ? "Мои тетради" : "Корзина"} active={trash} onClick={() => { setList(null); setTrash(!trash); }}>
            {trash ? <Undo2 size={18} /> : <Trash2 size={18} />}
          </IconButton>
          <Sep />
          <IconButton
            tip={profile?.displayName ?? "Профиль"}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.right - 200, y: r.bottom + 8, items: [{ label: "Мой профиль", icon: <Pencil size={16} />, onSelect: () => router.push("/app/profile") }, { label: "Выйти", icon: <LogOut size={16} />, onSelect: async () => { await signOut(); router.replace("/login"); } }] });
            }}
          >
            <span className={s.avatar}>{initials}</span>
          </IconButton>
        </Group>
      </header>

      <section className={s.grid}>
        {list === null &&
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={s.tile}><Skeleton h={22} w="60%" /><div style={{ height: 8 }} /><Skeleton h={14} w="40%" /></div>
          ))}

        {list?.length === 0 && (
          <div className={s.empty}>
            <div>
              {trash ? <Trash2 size={40} strokeWidth={1.4} /> : <FileStack size={40} strokeWidth={1.4} />}
              <b>{trash ? "Корзина пуста" : "Здесь будут ваши тетради"}</b>
              <p>{trash ? `Удалённое хранится ${TRASH_DAYS} дней` : "Тетрадь — это набор страниц-холстов"}</p>
              {!trash && <Button onClick={create}><Plus size={16} /> Создать тетрадь</Button>}
            </div>
          </div>
        )}

        {list && list.length > 0 && !trash && (
          <button className={`${s.tile} ${s.new}`} onClick={create} style={{ border: 0, font: "inherit" }}>
            <span className={s.plus}><Plus size={28} /></span>
            Новая тетрадь
          </button>
        )}

        {list?.map((ws, i) => (
          <article
            key={ws.id}
            className={s.tile}
            style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            onClick={() => !trash && renaming !== ws.id && router.push(`/app/w/${ws.id}`)}
            onContextMenu={(e) => openMenu(e, ws)}
          >
            <Cover id={ws.id} />
            <div className={s.more} onClick={(e) => e.stopPropagation()}>
              <IconButton tip="Ещё" onClick={(e) => openMenu(e, ws)}><MoreHorizontal size={18} /></IconButton>
            </div>
            {renaming === ws.id ? (
              <input
                className={s.rename}
                defaultValue={ws.name}
                maxLength={100}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => rename(ws, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <div className={s.name} title={ws.name}>{ws.name}</div>
            )}
            <div className={s.meta}>
              {trash ? (
                <span className={s.trashNote}>удалится через {daysLeft(ws.deletedAt!, TRASH_DAYS)} дн.</span>
              ) : (
                <>
                  <span><Clock size={12} /> {ago(ws.updatedAt)}</span>
                  <span>{pages(ws.pageCount)}</span>
                  {ROLE[ws.role] && <span className={s.role}>{ROLE[ws.role]}</span>}
                </>
              )}
            </div>
          </article>
        ))}
      </section>
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </main>
  );
}
