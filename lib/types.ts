export type Role = "owner" | "editor" | "viewer";
export type BackgroundType = "plain" | "grid" | "dots" | "ruled";
export type ElementType =
  | "text" | "note" | "image" | "formula" | "shape"
  | "connector" | "diagram_node" | "source" | "source_fragment" | "group";
export type SourceStatus = "pending" | "processing" | "ready" | "error" | "requires_ocr";

export interface Profile { id: string; email: string; displayName: string }

export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
/** Тетрадь в списке «Мои тетради» */
export interface WorkspaceCard extends Workspace { role: Role; pageCount: number }

export interface Canvas {
  id: string;
  workspaceId: string;
  name: string;
  backgroundType: BackgroundType;
  backgroundSpacing: 16 | 24 | 32 | 48;
  position: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasElement {
  id: string;
  canvasId: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  content: Record<string, unknown>;
  style: Record<string, unknown>;
  sourceId: string | null;
  groupId: string | null;
  createdBy: string | null;
  updatedAt: string;
}

export interface Source {
  id: string;
  workspaceId: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: SourceStatus;
  errorMessage: string | null;
  createdAt: string;
  /** только демо-режим: содержимое файла */
  dataUrl?: string;
}

export const TRASH_DAYS = 30;
