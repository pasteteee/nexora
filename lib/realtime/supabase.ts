"use client";
/**
 * Транспорт Supabase Realtime. Три приватных канала, права проверяют политики realtime.messages:
 * - `page:<id>` — подтверждённые сервером изменения объектов (рассылает триггер БД);
 * - `page:<id>:live` — presence и курсоры участников;
 * - `member:<userId>` — смена роли или исключение из тетради.
 * После отказа канал пересоздаётся явно (см. createSupabaseTransport); после каждого входа движок дозагружает страницу из БД.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toEl } from "@/lib/data/supabase-data";
import type { Role } from "@/lib/types";
import type { ConnectionHandlers, ConnectionStatus, CursorMessage, PageConnection, PresenceInfo, RealtimeTransport, RemoteOp } from "./types";

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

/** Паузы перед повторным подключением канала после отказа: холодный старт Realtime обычно проходит за 1–2 попытки */
export const REJOIN_DELAYS_MS = [250, 500, 1000, 2000, 5000];
export const rejoinDelay = (attempt: number) => REJOIN_DELAYS_MS[Math.min(attempt, REJOIN_DELAYS_MS.length - 1)];

type ChannelKind = "data" | "live" | "member";
type SubscribeStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED" | string;

/** Минимум клиента Supabase, который нужен транспорту (в тестах подменяется) */
export interface RealtimeClientLike {
  realtime: { setAuth(token?: string | null): Promise<unknown> | unknown };
  channel(name: string, opts?: unknown): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown> | unknown;
}

/**
 * Транспорт с явным восстановлением каналов (критерий 23).
 * При холодном старте Realtime первый join приватного канала может получить отказ
 * (инициализация tenant, создание partition). Тогда канал не «висит» в состоянии ошибки:
 * он удаляется и создаётся заново с новым JWT через короткую паузу, а интерфейс всё это время
 * показывает «нет связи». Статус «live» — только когда подключены и изменения, и присутствие;
 * после каждого (пере)подключения канала присутствия участник заново объявляет себя (track).
 */
export function createSupabaseTransport(client: () => RealtimeClientLike = supabaseBrowser as unknown as () => RealtimeClientLike, delay: (attempt: number) => number = rejoinDelay): RealtimeTransport {
  return {
    open({ pageId, workspaceId, me }, h: ConnectionHandlers): PageConnection {
      const sb = client();
      let closed = false;
      const channels: Partial<Record<ChannelKind, RealtimeChannel>> = {};
      const ready: Record<ChannelKind, boolean> = { data: false, live: false, member: false };
      const attempts: Record<ChannelKind, number> = { data: 0, live: 0, member: 0 };
      const timers = new Set<ReturnType<typeof setTimeout>>();
      let reported: ConnectionStatus | null = null;

      const report = () => {
        if (closed) return;
        const anyFailed = (["data", "live"] as const).some((k) => attempts[k] > 0 && !ready[k]);
        const next: ConnectionStatus = ready.data && ready.live ? "live" : anyFailed ? "offline" : "connecting";
        if (next !== reported) { reported = next; h.onStatus(next); }
      };

      const build: Record<ChannelKind, () => RealtimeChannel> = {
        data: () => sb.channel(`page:${pageId}`, { config: { private: true } })
          .on("broadcast", { event: "element" }, ({ payload }) => {
            const op = opFromPayload(payload as ElementPayload);
            if (op) h.onOps([op]);
          }),
        live: () => {
          const ch: RealtimeChannel = sb.channel(`page:${pageId}:live`, { config: { private: true, presence: { key: me.key, enabled: true }, broadcast: { self: false } } })
            .on("presence", { event: "sync" }, () => {
              if (channels.live !== ch) return;
              h.onPresence(peersFromState(ch.presenceState<PresenceInfo>() as unknown as Record<string, PresenceInfo[]>));
            })
            .on("broadcast", { event: "cursor" }, ({ payload }) => {
              const m = payload as CursorMessage;
              if (m && typeof m.key === "string") h.onCursor(m);
            });
          return ch;
        },
        member: () => sb.channel(`member:${me.userId}`, { config: { private: true } })
          .on("broadcast", { event: "role" }, ({ payload }) => {
            const p = payload as { workspace_id?: string; role?: Role | null };
            if (p?.workspace_id === workspaceId) h.onRole({ workspaceId, role: p.role ?? null });
          }),
      };

      const retry = (kind: ChannelKind) => {
        const ch = channels[kind];
        delete channels[kind];
        ready[kind] = false;
        if (ch) void sb.removeChannel(ch);
        const wait = delay(attempts[kind]);
        attempts[kind] += 1;
        report();
        const t = setTimeout(() => { timers.delete(t); void join(kind); }, wait);
        timers.add(t);
      };

      const join = async (kind: ChannelKind) => {
        if (closed) return;
        // приватные каналы авторизуются текущим JWT пользователя; при повторе — свежим
        try { await sb.realtime.setAuth(); } catch { /* токен подставится при входе */ }
        if (closed) return;
        const ch = build[kind]();
        channels[kind] = ch;
        ch.subscribe((status: SubscribeStatus) => {
          if (closed || channels[kind] !== ch) return;
          if (status === "SUBSCRIBED") {
            ready[kind] = true;
            attempts[kind] = 0;
            if (kind === "live") void ch.track({ userId: me.userId, name: me.name, color: me.color });
            report();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            retry(kind);
          }
        });
      };

      h.onStatus("connecting");
      reported = "connecting";
      void join("data");
      void join("live");
      void join("member");

      return {
        publishOps() { /* изменения рассылает триггер после подтверждения записи */ },
        sendCursor(cursor) {
          const live = channels.live;
          if (!live || !ready.live || closed) return;
          void live.send({ type: "broadcast", event: "cursor", payload: { key: me.key, cursor } satisfies CursorMessage });
        },
        close() {
          closed = true;
          for (const t of timers) clearTimeout(t);
          timers.clear();
          h.onStatus("idle");
          for (const c of Object.values(channels)) if (c) void sb.removeChannel(c);
          for (const k of Object.keys(channels) as ChannelKind[]) delete channels[k];
        },
      };
    },
  };
}

export const supabaseTransport: RealtimeTransport = createSupabaseTransport();
