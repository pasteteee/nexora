"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Eye, Share2, WifiOff } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import { usePresence, useRealtime } from "@/lib/realtime";
import type { Role } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ShareDialog } from "./ShareDialog";
import s from "./collab.module.css";

const MAX_AVATARS = 4;

/** Шапка совместной работы: кто сейчас на странице, режим наблюдателя, «Поделиться» */
export function CollabBar({ workspaceId, workspaceName, role: initialRole, canvasId, pageName }: {
  workspaceId: string; workspaceName: string; role: Role; canvasId: string; pageName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { status, role: liveRole, accessLost } = useRealtime(useShallow((st) => ({ status: st.status, role: st.role, accessLost: st.accessLost })));
  const { self, peers } = usePresence(canvasId);
  const role = liveRole ?? initialRole;

  // Один человек в двух вкладках — один аватар
  const people = useMemo(() => {
    const seen = new Map<string, (typeof peers)[number]>();
    for (const p of peers) if (p.userId !== self?.userId && !seen.has(p.userId)) seen.set(p.userId, p);
    return [...seen.values()];
  }, [peers, self]);
  const shown = people.slice(0, MAX_AVATARS);
  const names = people.map((p) => p.name).join(", ");

  return <div className={s.bar}>
    {people.length > 0 && <div className={s.avatars} role="group" aria-label={`Сейчас на странице: ${names}`}>
      {shown.map((p) => <Avatar key={p.userId} id={p.userId} name={p.name} color={p.color} title={p.name} />)}
      {people.length > MAX_AVATARS && <span className={`${s.avatar} ${s.more}`} title={names}>+{people.length - MAX_AVATARS}</span>}
    </div>}
    {status === "offline" && <span className={`${s.badge} ${s.offline}`} role="status" title="Изменения других участников появятся после восстановления связи">
      <WifiOff size={13} />Нет связи</span>}
    {role === "viewer" && <span className={s.badge} title="Наблюдатель может читать, но не изменять страницы"><Eye size={13} />Только просмотр</span>}
    <button className={s.share} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Поделиться"><Share2 size={18} /><span data-dock-label>Поделиться</span></button>
    <ShareDialog open={open} onClose={() => setOpen(false)} workspaceId={workspaceId} workspaceName={workspaceName}
      role={role} canvasId={canvasId} pageName={pageName} onLeft={() => router.replace("/app")} />
    <Dialog open={accessLost} title="Доступ к тетради закрыт" onClose={() => router.replace("/app")}
      actions={<Button onClick={() => router.replace("/app")}>К моим тетрадям</Button>}>
      Владелец исключил вас из тетради или тетрадь удалена. Несохранённые изменения не отправлены.
    </Dialog>
  </div>;
}
