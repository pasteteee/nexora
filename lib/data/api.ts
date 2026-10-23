import type { ImageContent } from "./images";
import type { Canvas, CanvasElement, Profile, Source, WorkspaceCard } from "@/lib/types";

/** Единый клиентский интерфейс данных. Реализации: local (демо) и supabase. */
export interface AuthApi {
  current(): Promise<Profile | null>;
  signUp(email: string, password: string, displayName: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateProfile(displayName: string): Promise<void>;
}

export interface DataApi {
  listWorkspaces(): Promise<WorkspaceCard[]>;
  listTrash(): Promise<WorkspaceCard[]>;
  getWorkspace(id: string): Promise<WorkspaceCard | null>;
  createWorkspace(name?: string): Promise<WorkspaceCard>;
  renameWorkspace(id: string, name: string): Promise<void>;
  trashWorkspace(id: string): Promise<void>;
  restoreWorkspace(id: string): Promise<void>;

  listCanvases(workspaceId: string): Promise<Canvas[]>;
  listCanvasTrash(workspaceId: string): Promise<Canvas[]>;
  getCanvas(id: string): Promise<Canvas | null>;
  createCanvas(workspaceId: string, name?: string): Promise<Canvas>;
  updateCanvas(id: string, patch: Partial<Pick<Canvas, "name" | "backgroundType" | "backgroundSpacing" | "position">>): Promise<void>;
  duplicateCanvas(id: string): Promise<Canvas>;
  trashCanvas(id: string): Promise<void>;
  restoreCanvas(id: string): Promise<void>;
  reorderCanvases(workspaceId: string, orderedIds: string[]): Promise<void>;

  listElements(canvasId: string): Promise<CanvasElement[]>;
  upsertElements(els: CanvasElement[]): Promise<void>;
  deleteElements(ids: string[]): Promise<void>;

  listSources(workspaceId: string): Promise<Source[]>;
  uploadSource(workspaceId: string, file: File): Promise<Source>;
  deleteSource(id: string): Promise<void>;

  /** Изображение для холста: хранилище тетради, не источник */
  uploadImage(workspaceId: string, file: File): Promise<ImageContent>;
  imageUrl(path: string): Promise<string>;
}

export class ApiError extends Error {
  constructor(message: string, public code: "not_found" | "forbidden" | "invalid" | "limit" | "auth" | "network") {
    super(message);
  }
}
