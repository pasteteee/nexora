import type { CanvasElement, Role } from "@/lib/types";

/** Подтверждённая операция над объектом страницы. updatedAt / at — серверные метки времени. */
export type RemoteOp =
  | { kind: "upsert"; element: CanvasElement }
  | { kind: "delete"; id: string; at: string };

export type Point = { x: number; y: number };

/** Временные данные участника: не записываются в БД (ТЗ 4.2.9). */
export interface PresenceInfo {
  /** Ключ вкладки: один пользователь может открыть страницу в двух окнах */
  key: string;
  userId: string;
  name: string;
  color: string;
}
export interface Peer extends PresenceInfo { cursor: Point | null }
export interface CursorMessage { key: string; cursor: Point | null }
export interface RoleEvent { workspaceId: string; role: Role | null }

export type ConnectionStatus = "idle" | "connecting" | "live" | "offline";

export interface ConnectionHandlers {
  onOps(ops: RemoteOp[]): void;
  onStatus(status: ConnectionStatus): void;
  onPresence(peers: PresenceInfo[]): void;
  onCursor(message: CursorMessage): void;
  onRole(event: RoleEvent): void;
}

export interface PageConnection {
  /** Демо-режим: разослать сохранённые операции. В Supabase их рассылает сервер. */
  publishOps(ops: RemoteOp[]): void;
  sendCursor(cursor: Point | null): void;
  close(): void;
}

export interface RealtimeTransport {
  open(p: { pageId: string; workspaceId: string; me: PresenceInfo }, handlers: ConnectionHandlers): PageConnection;
}
