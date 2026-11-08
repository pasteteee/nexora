"use client";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, LogOut, Crown, UserMinus, X } from "lucide-react";
import { Button, Spinner, toast } from "@/components/ui";
import ui from "@/components/ui/ui.module.css";
import {
  collab, roleLabel,
  type Invitation, type InvitationRole, type InviteResult, type Member, type Publication,
} from "@/lib/collab";
import { ApiError, demoMode } from "@/lib/data";
import { announceRoleChange } from "@/lib/realtime";
import type { Role } from "@/lib/types";
import { Avatar } from "./Avatar";
import s from "./collab.module.css";

type Tab = "members" | "publication";

const message = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error) && e.message ? e.message : fallback;
const absolute = (path: string) => (typeof window === "undefined" ? path : new URL(path, window.location.origin).toString());
const until = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast("Ссылка скопирована"); }
  catch { toast("Не удалось скопировать. Выделите ссылку и скопируйте вручную"); }
}

/** Диалог «Поделиться»: участники тетради и публикация текущей страницы */
export function ShareDialog({ open, onClose, workspaceId, workspaceName, role, canvasId, pageName, onLeft }: {
  open: boolean; onClose(): void; workspaceId: string; workspaceName: string; role: Role;
  canvasId: string; pageName: string; onLeft(): void;
}) {
  const [tab, setTab] = useState<Tab>("members");
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className={ui.backdrop} onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`${ui.dialog} ${s.panel}`} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 id={titleId} className={ui.dialogTitle} style={{ margin: 0 }}>Поделиться «{workspaceName}»</h2>
          <button className={s.icon} onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <div className={s.tabs} role="tablist" aria-label="Разделы">
          <button role="tab" className={s.tab} aria-selected={tab === "members"} onClick={() => setTab("members")}>Участники</button>
          <button role="tab" className={s.tab} aria-selected={tab === "publication"} onClick={() => setTab("publication")}>Публикация</button>
        </div>
        {tab === "members"
          ? <MembersTab workspaceId={workspaceId} role={role} onLeft={onLeft} />
          : <PublicationTab canvasId={canvasId} pageName={pageName} canPublish={role !== "viewer"} />}
      </div>
    </div>,
    document.body,
  );
}

function MembersTab({ workspaceId, role, onLeft }: { workspaceId: string; role: Role; onLeft(): void }) {
  const isOwner = role === "owner";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "transfer" | "remove" | "leave"; member: Member } | null>(null);

  const load = useCallback(() => Promise.all([
    collab.listMembers(workspaceId), isOwner ? collab.listInvitations(workspaceId) : Promise.resolve([] as Invitation[]),
  ]).then(([list, inv]) => {
    setMembers(list); setInvites(inv.filter((i) => i.status === "pending")); setError("");
  }, (e: unknown) => setError(message(e, "Не удалось загрузить участников"))), [workspaceId, isOwner]);
  useEffect(() => { void load(); }, [load]);

  async function changeRole(m: Member, next: InvitationRole) {
    const before = members;
    setMembers((list) => list?.map((x) => (x.userId === m.userId ? { ...x, role: next } : x)) ?? null); // оптимистично
    try {
      await collab.setRole(workspaceId, m.userId, next);
      if (demoMode) announceRoleChange(m.userId, workspaceId, next);
      toast(`${m.displayName || "Участник"}: ${roleLabel[next].toLowerCase()}`);
    } catch (e) { setMembers(before); toast(message(e, "Не удалось изменить роль")); }
  }
  async function confirmed() {
    if (!confirm) return;
    const { kind, member } = confirm;
    setConfirm(null);
    try {
      if (kind === "transfer") {
        await collab.transferOwnership(workspaceId, member.userId);
        if (demoMode) { announceRoleChange(member.userId, workspaceId, "owner"); }
        toast(`Владелец теперь ${member.displayName || "выбранный участник"}. Вы — редактор`);
        window.location.reload();
        return;
      }
      if (kind === "leave") { await collab.leave(workspaceId); onLeft(); return; }
      await collab.removeMember(workspaceId, member.userId);
      if (demoMode) announceRoleChange(member.userId, workspaceId, null);
      toast("Участник исключён");
      await load();
    } catch (e) { toast(message(e, "Не удалось выполнить действие")); }
  }

  if (error) return <div className={s.section}><p className={s.error} role="alert">{error}</p><Button variant="ghost" onClick={() => void load()}>Повторить</Button></div>;
  if (!members) return <div style={{ display: "grid", placeItems: "center", minHeight: 120 }}><Spinner /></div>;
  return <>
    {isOwner && <InviteForm workspaceId={workspaceId} onInvited={(inv) => setInvites((list) => [inv, ...list.filter((i) => i.email !== inv.email)])} />}
    <div className={s.section}>
      <p className={s.label}>В тетради · {members.length}</p>
      <ul className={s.list}>
        {members.map((m) => <li key={m.userId} className={s.row}>
          <Avatar id={m.userId} name={m.displayName || m.email || "?"} />
          <div className={s.who}>
            <div className={s.name}>{m.displayName || m.email || "Участник"}{m.isMe && " (вы)"}</div>
            {m.email && <div className={s.sub}>{m.email}</div>}
          </div>
          <div className={s.actions}>
            {isOwner && m.role !== "owner" ? <>
              <select className={s.select} aria-label={`Роль: ${m.displayName || m.email}`} value={m.role}
                onChange={(e) => void changeRole(m, e.target.value as InvitationRole)}>
                <option value="editor">Редактор</option>
                <option value="viewer">Наблюдатель</option>
              </select>
              <button className={s.icon} title="Передать владение" aria-label={`Передать владение: ${m.displayName || m.email}`} onClick={() => setConfirm({ kind: "transfer", member: m })}><Crown size={16} /></button>
              <button className={s.icon} data-danger title="Исключить" aria-label={`Исключить: ${m.displayName || m.email}`} onClick={() => setConfirm({ kind: "remove", member: m })}><UserMinus size={16} /></button>
            </> : <span className={s.sub}>{roleLabel[m.role]}</span>}
            {m.isMe && m.role !== "owner" && <button className={s.icon} data-danger title="Выйти из тетради" aria-label="Выйти из тетради" onClick={() => setConfirm({ kind: "leave", member: m })}><LogOut size={16} /></button>}
          </div>
        </li>)}
      </ul>
    </div>
    {isOwner && invites.length > 0 && <div className={s.section}>
      <p className={s.label}>Ожидают ответа · {invites.length}</p>
      <ul className={s.list}>
        {invites.map((i) => <li key={i.id} className={s.row}>
          <Avatar id={i.email} name={i.email} />
          <div className={s.who}><div className={s.name}>{i.email}</div><div className={s.sub}>{roleLabel[i.role]} · до {until(i.expiresAt)}</div></div>
          <button className={s.icon} data-danger title="Отозвать" aria-label={`Отозвать приглашение ${i.email}`} onClick={async () => {
            try { await collab.revokeInvitation(i.id); setInvites((list) => list.filter((x) => x.id !== i.id)); toast("Приглашение отозвано"); }
            catch (e) { toast(message(e, "Не удалось отозвать приглашение")); }
          }}><X size={16} /></button>
        </li>)}
      </ul>
    </div>}
    {!isOwner && <p className={s.note}>Приглашать участников и менять роли может только владелец тетради.</p>}
    {confirm && <ConfirmBox
      text={confirm.kind === "transfer"
        ? `Передать владение участнику ${confirm.member.displayName || confirm.member.email}? Вы станете редактором и не сможете вернуть права сами.`
        : confirm.kind === "leave" ? "Выйти из тетради? Вернуться можно только по новому приглашению."
        : `Исключить ${confirm.member.displayName || confirm.member.email}? Доступ закроется сразу.`}
      action={confirm.kind === "transfer" ? "Передать" : confirm.kind === "leave" ? "Выйти" : "Исключить"}
      onCancel={() => setConfirm(null)} onConfirm={() => void confirmed()} />}
  </>;
}

function ConfirmBox({ text, action, onCancel, onConfirm }: { text: string; action: string; onCancel(): void; onConfirm(): void }) {
  return <div className={s.switch} role="alertdialog" aria-label={action}>
    <p className={s.note} style={{ flex: 1 }}>{text}</p>
    <div className={s.actions}><Button variant="ghost" onClick={onCancel}>Отмена</Button><Button variant="danger" onClick={onConfirm} autoFocus>{action}</Button></div>
  </div>;
}

function InviteForm({ workspaceId, onInvited }: { workspaceId: string; onInvited(i: Invitation): void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitationRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setResult(null);
    try {
      const r = await collab.invite(workspaceId, email, role);
      setResult(r); onInvited(r.invitation); setEmail("");
    } catch (err) { setError(message(err, "Не удалось отправить приглашение")); }
    finally { setBusy(false); }
  }
  return <form className={s.section} onSubmit={submit} noValidate>
    <p className={s.label}>Пригласить по e-mail</p>
    <div className={s.form}>
      <input className={s.input} type="email" inputMode="email" autoComplete="off" placeholder="name@example.com" aria-label="E-mail участника"
        value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} required maxLength={320} />
      <select className={s.select} style={{ height: 36 }} aria-label="Роль приглашённого" value={role} onChange={(e) => setRole(e.target.value as InvitationRole)}>
        <option value="editor">Редактор</option>
        <option value="viewer">Наблюдатель</option>
      </select>
      <Button type="submit" disabled={busy || !email.trim()}>{busy ? "Отправляем…" : "Пригласить"}</Button>
    </div>
    {error && <p className={s.error} role="alert">{error}</p>}
    {result && <div className={s.section} role="status">
      <p className={s.note}>{result.emailed
        ? `Письмо отправлено на ${result.invitation.email}. Ссылка действует 72 часа.`
        : demoMode
          ? "Демо-режим: письма не отправляются. Откройте ссылку, войдя под приглашённым адресом."
          : "Письмо не отправлено (почта не настроена или недоступна). Передайте ссылку сами — она действует 72 часа и только для этого адреса."}</p>
      {!result.emailed && <LinkBox url={absolute(result.link)} label="Ссылка-приглашение" />}
    </div>}
  </form>;
}

function LinkBox({ url, label, open }: { url: string; label: string; open?: boolean }) {
  return <div className={s.linkBox}>
    <input className={s.input} readOnly value={url} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
    <button type="button" className={s.icon} onClick={() => void copy(url)} aria-label="Скопировать ссылку" title="Скопировать"><Copy size={16} /></button>
    {open && <a className={s.icon} href={url} target="_blank" rel="noopener noreferrer" aria-label="Открыть в новой вкладке" title="Открыть"><ExternalLink size={16} /></a>}
  </div>;
}

function PublicationTab({ canvasId, pageName, canPublish }: { canvasId: string; pageName: string; canPublish: boolean }) {
  const [pub, setPub] = useState<Publication | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    collab.getPublication(canvasId).then((p) => { if (alive) setPub(p); })
      .catch((e) => { if (alive) { setPub(null); setError(message(e, "Не удалось загрузить публикацию")); } });
    return () => { alive = false; };
  }, [canvasId]);
  async function toggle() {
    setBusy(true); setError("");
    try {
      if (pub?.isActive) { await collab.unpublish(canvasId); setPub({ ...pub, isActive: false }); toast("Публикация отключена: ссылка больше не работает"); }
      else { setPub(await collab.publish(canvasId)); toast("Страница опубликована"); }
    } catch (e) { setError(message(e, "Не удалось изменить публикацию")); }
    finally { setBusy(false); }
  }
  if (pub === undefined) return <div style={{ display: "grid", placeItems: "center", minHeight: 120 }}><Spinner /></div>;
  const active = !!pub?.isActive;
  return <div className={s.section}>
    <div className={s.switch}>
      <div>
        <strong>{active ? "Страница опубликована" : "Страница приватная"}</strong>
        <span className={s.sub}>«{pageName}» · {active ? "любой по ссылке видит только чтение" : "видят только участники тетради"}</span>
      </div>
      {canPublish && <Button variant={active ? "danger" : "primary"} disabled={busy} onClick={() => void toggle()} aria-pressed={active}>
        {busy ? "…" : active ? "Отключить" : "Опубликовать"}</Button>}
    </div>
    {active && pub && <LinkBox url={absolute(pub.path)} label="Публичная ссылка" open />}
    {error && <p className={s.error} role="alert">{error}</p>}
    <p className={s.note}>{canPublish
      ? "Публикуется только эта страница. Материалы, файлы, изображения и история ИИ в публичный просмотр не попадают. Повторная публикация после отключения выдаёт новую ссылку."
      : "Публиковать страницу может владелец или редактор."}</p>
  </div>;
}
