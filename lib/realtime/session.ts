/**
 * Realtime-сессия открытой страницы: связывает транспорт, движок LWW и стор редактора.
 * Не зависит от React — хуки в hooks.ts только запускают её и читают состояние.
 */
import { create } from "zustand";
import { useEditor } from "@/lib/editor/store";
import { isPendingLocal, onSaved, pendingLocalIds } from "@/lib/editor/autosave";
import type { CanvasElement, Role, WorkspaceCard } from "@/lib/types";
import { PageSync } from "./engine";
import type { ConnectionStatus, PageConnection, Point, PresenceInfo, RealtimeTransport, RemoteOp } from "./types";

export const CURSOR_THROTTLE_MS = 50;

export type RealtimeState = {
  pageId: string | null;
  status: ConnectionStatus;
  /** undefined — ещё не известна, null — доступа больше нет */
  role: Role | null | undefined;
  accessLost: boolean;
  self: PresenceInfo | null;
  /** Все, кто сейчас на странице, включая себя */
  presence: PresenceInfo[];
  cursors: Record<string, Point | null>;
};
const initial: RealtimeState = { pageId: null, status: "idle", role: undefined, accessLost: false, self: null, presence: [], cursors: {} };
export const useRealtime = create<RealtimeState>(() => ({ ...initial }));

export interface SessionData {
  listElements(canvasId: string): Promise<CanvasElement[]>;
  getWorkspace(id: string): Promise<WorkspaceCard | null>;
}

let active: { pageId: string; connection: PageConnection; cursor: (p: Point | null) => void } | null = null;

export function startPageRealtime(o: {
  pageId: string; workspaceId: string; me: PresenceInfo; transport: RealtimeTransport; data: SessionData;
}): () => void {
  const { pageId, workspaceId, me } = o;
  let stopped = false;
  const onPage = () => !stopped && useEditor.getState().canvasId === pageId;

  const sync = new PageSync({
    elements: () => (onPage() ? useEditor.getState().els : {}),
    apply: (p) => { if (onPage()) useEditor.getState().applyRemote(p); },
    isPending: isPendingLocal,
    pendingIds: pendingLocalIds,
    load: () => o.data.listElements(pageId),
  });

  const applyRole = (role: Role | null) => {
    if (stopped) return;
    useRealtime.setState({ role, accessLost: role === null });
    if (onPage()) useEditor.getState().setCanEdit(role === "owner" || role === "editor");
  };
  const refreshRole = () => o.data.getWorkspace(workspaceId)
    .then((w) => applyRole(w?.role ?? null))
    .catch(() => { /* сеть — оставляем прежнюю роль */ });

  useRealtime.setState({ ...initial, pageId, self: me, presence: [me] });

  const connection = o.transport.open({ pageId, workspaceId, me }, {
    onOps: (ops) => { if (!stopped) sync.receive(ops); },
    onStatus: (status) => {
      if (stopped) return;
      useRealtime.setState({ status });
      // при каждом (пере)подключении — дозагрузка из БД и проверка роли
      if (status === "live") { void sync.resync().catch(() => {}); void refreshRole(); }
    },
    onPresence: (list) => {
      if (stopped) return;
      const keys = new Set(list.map((p) => p.key));
      const cursors = Object.fromEntries(Object.entries(useRealtime.getState().cursors).filter(([k]) => keys.has(k)));
      const presence = list.some((p) => p.key === me.key) ? list : [me, ...list];
      useRealtime.setState({ presence, cursors });
    },
    onCursor: ({ key, cursor }) => {
      if (stopped || key === me.key) return;
      useRealtime.setState({ cursors: { ...useRealtime.getState().cursors, [key]: cursor } });
    },
    onRole: ({ role }) => applyRole(role),
  });

  // демо-режим: сохранённые правки уходят в другие вкладки (в Supabase — триггером)
  const unsubscribeSaved = onSaved(({ upserted, removed }) => {
    const at = new Date().toISOString();
    const ops: RemoteOp[] = [
      ...upserted.filter((e) => e.canvasId === pageId).map((e) => ({ kind: "upsert" as const, element: { ...e, updatedAt: at } })),
      ...removed.map((id) => ({ kind: "delete" as const, id, at })),
    ];
    if (ops.length) connection.publishOps(ops);
  });

  const cursor = throttle((p: Point | null) => connection.sendCursor(p), CURSOR_THROTTLE_MS);
  active = { pageId, connection, cursor };

  return () => {
    if (stopped) return;
    stopped = true;
    cursor.cancel();
    unsubscribeSaved();
    connection.close();
    if (active?.connection === connection) active = null;
    useRealtime.setState({ ...initial });
  };
}

/** Положение своего курсора в координатах страницы; null — курсор ушёл со страницы */
export function moveCursor(pageId: string, p: Point | null) {
  if (active?.pageId === pageId) active.cursor(p);
}

/** Не чаще раза в ms, последнее значение не теряется */
export function throttle<T>(fn: (v: T) => void, ms: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { v: T } | null = null;
  const run = () => { timer = undefined; last = Date.now(); if (pending) { const { v } = pending; pending = null; fn(v); } };
  const call = (v: T) => {
    pending = { v };
    const wait = ms - (Date.now() - last);
    if (wait <= 0 && !timer) run();
    else if (!timer) timer = setTimeout(run, wait);
  };
  call.cancel = () => { clearTimeout(timer); timer = undefined; pending = null; };
  return call;
}

/** Постоянный цвет участника по его id */
const COLORS = ["#e5484d", "#f76b15", "#ffb224", "#30a46c", "#12a594", "#0090ff", "#6e56cf", "#d6409f"];
export function colorFor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}
