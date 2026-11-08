"use client";
/**
 * Хуки совместной работы. UI редактора подключает их без изменения вида:
 * - usePageRealtime — синхронизация объектов страницы, роль, статус соединения;
 * - usePresence — участники страницы, их курсоры и отправка своего курсора.
 */
import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { auth, data, demoMode } from "@/lib/data";
import { useSession } from "@/lib/session";
import { broadcastTransport } from "./broadcast";
import { supabaseTransport } from "./supabase";
import { colorFor, moveCursor, startPageRealtime, useRealtime } from "./session";
import type { Peer, Point, PresenceInfo } from "./types";

const tabKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

async function identity(): Promise<PresenceInfo | null> {
  const profile = useSession.getState().profile ?? await auth.current().catch(() => null);
  if (!profile) return null;
  const name = profile.displayName?.trim() || profile.email.split("@")[0] || "Участник";
  return { key: tabKey(), userId: profile.id, name, color: colorFor(profile.id) };
}

export function usePageRealtime(pageId: string | null, workspaceId: string | null) {
  useEffect(() => {
    if (!pageId || !workspaceId) return;
    let alive = true;
    let stop: (() => void) | undefined;
    void identity().then((me) => {
      if (!alive || !me) return;
      stop = startPageRealtime({ pageId, workspaceId, me, transport: demoMode ? broadcastTransport : supabaseTransport, data });
    });
    return () => { alive = false; stop?.(); };
  }, [pageId, workspaceId]);
  return useRealtime(useShallow((s) => ({ status: s.status, role: s.role, accessLost: s.accessLost })));
}

export function usePresence(pageId: string | null): { self: PresenceInfo | null; peers: Peer[]; moveCursor(p: Point | null): void } {
  const { current, self, presence, cursors } = useRealtime(useShallow((s) => ({
    current: s.pageId, self: s.self, presence: s.presence, cursors: s.cursors,
  })));
  const on = !!pageId && current === pageId;
  const peers = useMemo(() => on
    ? presence.filter((p) => p.key !== self?.key).map((p) => ({ ...p, cursor: cursors[p.key] ?? null }))
    : [], [on, presence, cursors, self]);
  const move = useCallback((p: Point | null) => { if (pageId) moveCursor(pageId, p); }, [pageId]);
  return { self: on ? self : null, peers, moveCursor: move };
}
