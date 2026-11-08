"use client";
/**
 * Транспорт Supabase Realtime. Три приватных канала, права проверяют политики realtime.messages:
 * - `page:<id>` — подтверждённые сервером изменения объектов (рассылает триггер БД);
 * - `page:<id>:live` — presence и курсоры участников;
 * - `member:<userId>` — смена роли или исключение из тетради.
 * Клиент восстанавливает каналы сам; после каждого входа движок дозагружает страницу из БД.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toEl } from "@/lib/data/supabase-data";
import type { Role } from "@/lib/types";
import type { ConnectionHandlers, CursorMessage, PageConnection, PresenceInfo, RealtimeTransport, RemoteOp } from "./types";

type ElementPayload = { op: "upsert"; row: Record<string, unknown> } | { op: "delete"; id: string; at: string };

export function opFromPayload(p: ElementPayload): RemoteOp | null {
  if (p?.op === "upsert" && p.row && typeof p.row.id === "string") return { kind: "upsert", element: toEl(p.row) };
  if (p?.op === "delete" && typeof p.id === "string") return { kind: "delete", id: p.id, at: String(p.at) };
  return null;
}

/** Состояние presence → список участников; у одного ключа может быть несколько записей */
export function peersFromState(state: Record<string, PresenceInfo[]>): PresenceInfo[] {
  const out: PresenceInfo[] = [];
  for (const [key, metas] of Object.entries(state)) {
    const m = metas.at(-1);
    if (m && typeof m.userId === "string") out.push({ key, userId: m.userId, name: String(m.name ?? ""), color: String(m.color ?? "") });
  }
  return out;
}

export const supabaseTransport: RealtimeTransport = {
  open({ pageId, workspaceId, me }, h: ConnectionHandlers): PageConnection {
    const sb = supabaseBrowser();
    let closed = false;
    const channels: RealtimeChannel[] = [];
    let live: RealtimeChannel | null = null;
    let liveReady = false;

    h.onStatus("connecting");
    void (async () => {
      // приватные каналы авторизуются текущим JWT пользователя
      try { await sb.realtime.setAuth(); } catch { /* токен подставится при входе */ }
      if (closed) return;

      const data = sb.channel(`page:${pageId}`, { config: { private: true } })
        .on("broadcast", { event: "element" }, ({ payload }) => {
          const op = opFromPayload(payload as ElementPayload);
          if (op) h.onOps([op]);
        })
        .subscribe((status) => {
          if (closed) return;
          if (status === "SUBSCRIBED") h.onStatus("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") h.onStatus("offline");
        });

      live = sb.channel(`page:${pageId}:live`, { config: { private: true, presence: { key: me.key, enabled: true }, broadcast: { self: false } } })
        .on("presence", { event: "sync" }, () => {
          h.onPresence(peersFromState(live!.presenceState<PresenceInfo>() as unknown as Record<string, PresenceInfo[]>));
        })
        .on("broadcast", { event: "cursor" }, ({ payload }) => {
          const m = payload as CursorMessage;
          if (m && typeof m.key === "string") h.onCursor(m);
        })
        .subscribe((status) => {
          liveReady = status === "SUBSCRIBED";
          if (liveReady && !closed) void live!.track({ userId: me.userId, name: me.name, color: me.color });
        });

      const member = sb.channel(`member:${me.userId}`, { config: { private: true } })
        .on("broadcast", { event: "role" }, ({ payload }) => {
          const p = payload as { workspace_id?: string; role?: Role | null };
          if (p?.workspace_id === workspaceId) h.onRole({ workspaceId, role: p.role ?? null });
        })
        .subscribe();

      channels.push(data, live, member);
    })();

    return {
      publishOps() { /* изменения рассылает триггер после подтверждения записи */ },
      sendCursor(cursor) {
        if (!live || !liveReady || closed) return;
        void live.send({ type: "broadcast", event: "cursor", payload: { key: me.key, cursor } satisfies CursorMessage });
      },
      close() {
        closed = true;
        h.onStatus("idle");
        for (const c of channels) void sb.removeChannel(c);
        channels.length = 0;
      },
    };
  },
};
