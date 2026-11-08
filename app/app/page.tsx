"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArchiveRestore, BookOpen, Clock, LogOut, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button, Menu, Skeleton, toast, type MenuItem } from "@/components/ui";
import { Dock, DockButton, DockGroup, DockSep } from "@/components/ui/Dock";
import { Cover } from "@/components/notebooks/Cover";
import s from "@/components/notebooks/notebooks.module.css";
import { data, ApiError } from "@/lib/data";
import { useSession } from "@/lib/session";
import { ago, daysLeft } from "@/lib/time";
import { TRASH_DAYS, type WorkspaceCard } from "@/lib/types";
import { validateTitle } from "@/lib/validation";

const ROLE = { owner: null, editor: "редактор", viewer: "читатель" } as const;
const plural = (n: number, one: string, few: string, many: string) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many}`;
const notebooks = (n: number) => plural(n, "тетрадь", "тетради", "тетрадей");
const pages = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "страница" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "страницы" : "страниц"}`;

export default function Notebooks() {
  const router = useRouter();
  const { profile, signOut } = useSession();
  const [trash, setTrash] = useState(false);
  const [list, setList] = useState<WorkspaceCard[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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
    try {
      const ws = await data.createWorkspace();
      router.push(`/app/w/${ws.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не удалось создать тетрадь");
    }
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
  const q = query.trim().toLowerCase();
  const shown = list && q ? list.filter((ws) => ws.name.toLowerCase().includes(q)) : list;
  const switchTo = (t: boolean) => { if (t === trash) return; setList(null); setQuery(""); setTrash(t); };

  return (
    <main className={s.page}>
      <div className={s.inner}>
        <header className={s.top}>
          <Link href="/" className={s.brand}><span className={s.mark} />Nexora</Link>
        </header>

        <div className={s.head}>
          <div>
            <h1>{trash ? "Корзина" : "Мои тетради"}</h1>
            <p>{trash ? `Удалённые тетради хранятся ${TRASH_DAYS} дней, потом исчезают совсем.`
              : list?.length ? `${notebooks(list.length)}. Конспекты, файлы, формулы и фото лежат по темам.`
              : "Конспекты, файлы, формулы и фото лежат по темам."}</p>
          </div>
          {list && list.length > 3 && <label className={s.search}>
            <Search size={16} />
            <input type="search" placeholder="Найти тетрадь" aria-label="Найти тетрадь" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>}
        </div>

        {list?.length === 0 ? (
          <div className={s.empty}>
            {trash ? <><b>Корзина пуста</b><p>Сюда попадают удалённые тетради</p></>
              : <><div className={s.stack} aria-hidden><i /><i /><i /></div>
                <b>Здесь будут ваши тетради</b>
                <p>Заведите тетрадь под предмет или проект: в ней хранятся страницы, файлы, формулы и фото</p>
                <Button onClick={create}><Plus size={16} /> Новая тетрадь</Button></>}
          </div>
        ) : (
          <section className={s.grid} aria-label={trash ? "Тетради в корзине" : "Тетради"}>
            {list === null && Array.from({ length: 6 }, (_, i) => <div key={i} className={s.item}><div className={s.skel}><Skeleton h="100%" r={8} /></div><Skeleton h={14} w="50%" /></div>)}

            {shown?.length === 0 && <p className={s.noMatch}>Нет тетрадей с «{query.trim()}» в названии</p>}

            {shown?.map((ws, i) => {
              const plate = renaming === ws.id
                ? <input className={s.rename} defaultValue={ws.name} maxLength={100} autoFocus aria-label="Название тетради"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onBlur={(e) => rename(ws, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }} />
                : <span className={s.name} title={ws.name}>{ws.name}</span>;
              const cover = <Cover id={ws.id} muted={trash}>{plate}<span className={s.pages}>{pages(ws.pageCount)}</span></Cover>;
              return <article key={ws.id} className={s.item} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }} onContextMenu={(e) => openMenu(e, ws)}>
                {trash || renaming === ws.id ? <div>{cover}</div>
                  // A real link: the notebook opens from the keyboard and in a new tab.
                  : <Link href={`/app/w/${ws.id}`} aria-label={`${ws.name}, ${pages(ws.pageCount)}`}>{cover}</Link>}
                <div className={s.meta}>
                  {trash ? <span className={s.trashNote}>удалится через {daysLeft(ws.deletedAt!, TRASH_DAYS)} дн.</span>
                    : <><span><Clock size={13} /> {ago(ws.updatedAt)}</span>{ROLE[ws.role] && <span className={s.role}>{ROLE[ws.role]}</span>}</>}
                </div>
                {(trash || ws.role === "owner") && <div className={s.more}>
                  <button type="button" aria-label={`Действия: ${ws.name}`} onClick={(e) => openMenu(e, ws)}><MoreHorizontal size={18} /></button>
                </div>}
              </article>;
            })}
          </section>
        )}
      </div>

      <Dock label="Панель тетрадей">
        {!trash && <><DockButton primary icon={<Plus size={18} />} tip="Новая тетрадь" label="Новая тетрадь" onClick={create} /><DockSep /></>}
        <DockGroup label="Разделы">
          <DockButton icon={<BookOpen size={18} />} tip="Мои тетради" label="Тетради" active={!trash} onClick={() => switchTo(false)} />
          <DockButton icon={<Trash2 size={18} />} tip="Корзина" label="Корзина" active={trash} onClick={() => switchTo(true)} />
        </DockGroup>
        <DockSep />
        <DockButton icon={<span className={s.avatar}>{initials}</span>} tip={profile?.displayName ?? "Профиль"}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.right - 200, y: r.top - 92, items: [{ label: "Мой профиль", icon: <Pencil size={16} />, onSelect: () => router.push("/app/profile") }, { label: "Выйти", icon: <LogOut size={16} />, onSelect: async () => { await signOut(); router.replace("/login"); } }] });
          }} />
      </Dock>
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </main>
  );
}
