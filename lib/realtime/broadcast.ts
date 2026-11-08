/**
 * Демо-режим без Supabase: вкладки одного браузера обмениваются через BroadcastChannel.
 * Presence эмулируется пульсом: участник без сигнала дольше PEER_TTL_MS считается ушедшим.
 */
import type { Role } from "@/lib/types";
import type { ConnectionHandlers, CursorMessage, PageConnection, PresenceInfo, RealtimeTransport, RemoteOp, RoleEvent } from "./types";

export const HEARTBEAT_MS = 1000;
export const PEER_TTL_MS = 3500;

type Message =
  | { t: "ops"; ops: RemoteOp[] }
  | { t: "hello"; peer: PresenceInfo }
  | { t: "here"; peer: PresenceInfo }
  | { t: "bye"; key: string }
  | { t: "cursor"; message: CursorMessage };

const pageTopic = (id: string) => `nexora:page:${id}`;
const memberTopic = (userId: string) => `nexora:member:${userId}`;

/** Демо-аналог триггера смены роли: вызывается слоем данных после изменения участника */
export function announceRoleChange(userId: string, workspaceId: string, role: Role | null) {
  if (typeof BroadcastChannel === "undefined") return;
  const ch = new BroadcastChannel(memberTopic(userId));
  ch.postMessage({ workspaceId, role } satisfies RoleEvent);
  ch.close();
}

export const broadcastTransport: RealtimeTransport = {
  open({ pageId, workspaceId, me }, h: ConnectionHandlers): PageConnection {
    if (typeof BroadcastChannel === "undefined") {
      h.onStatus("offline");
      return { publishOps() {}, sendCursor() {}, close() { h.onStatus("idle"); } };
    }
    const page = new BroadcastChannel(pageTopic(pageId));
    const member = new BroadcastChannel(memberTopic(me.userId));
    const peers = new Map<string, { info: PresenceInfo; seen: number }>();
    let closed = false;

    const emitPeers = () => h.onPresence([me, ...[...peers.values()].map((p) => p.info)]);
    const post = (m: Message) => { if (!closed) page.postMessage(m); };
    const see = (info: PresenceInfo) => {
      if (info.key === me.key) return;
      const known = peers.has(info.key);
      peers.set(info.key, { info, seen: Date.now() });
      if (!known) emitPeers();
    };

    page.onmessage = (e: MessageEvent<Message>) => {
      const m = e.data;
      if (closed || !m || typeof m !== "object") return;
      if (m.t === "ops") h.onOps(m.ops);
      else if (m.t === "hello") { see(m.peer); post({ t: "here", peer: me }); }
      else if (m.t === "here") see(m.peer);
      else if (m.t === "bye") { if (peers.delete(m.key)) emitPeers(); }
      else if (m.t === "cursor") {
        const p = peers.get(m.message.key);
        if (p) p.seen = Date.now();
        h.onCursor(m.message);
      }
    };
    member.onmessage = (e: MessageEvent<RoleEvent>) => {
      if (!closed && e.data?.workspaceId === workspaceId) h.onRole({ workspaceId, role: e.data.role ?? null });
    };

    const beat = setInterval(() => {
      post({ t: "here", peer: me });
      const now = Date.now();
      let changed = false;
      for (const [key, p] of peers) if (now - p.seen > PEER_TTL_MS) { peers.delete(key); changed = true; }
      if (changed) emitPeers();
    }, HEARTBEAT_MS);
    const leave = () => post({ t: "bye", key: me.key });
    if (typeof window !== "undefined") window.addEventListener("pagehide", leave);

    h.onStatus("connecting");
    queueMicrotask(() => {
      if (closed) return;
      h.onStatus("live");
      emitPeers();
      post({ t: "hello", peer: me });
    });

    return {
      publishOps(ops) { if (ops.length) post({ t: "ops", ops }); },
      sendCursor(cursor) { post({ t: "cursor", message: { key: me.key, cursor } }); },
      close() {
        leave();
        closed = true;
        clearInterval(beat);
        if (typeof window !== "undefined") window.removeEventListener("pagehide", leave);
        page.close(); member.close();
        h.onStatus("idle");
      },
    };
  },
};
