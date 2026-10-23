"use client";
/**
 * Демо-реализация на localStorage — работает без стенда Supabase.
 * Повторяет серверные правила: роли, корзина 30 дней, лимиты загрузки.
 */
import type { AuthApi, DataApi } from "./api";
import { ApiError } from "./api";
import type { Canvas, CanvasElement, Profile, Role, Source, Workspace, WorkspaceCard } from "@/lib/types";
import { TRASH_DAYS } from "@/lib/types";
import { checkUpload, sourceMime } from "./upload-rules";
import { demoDataUrl, imageSize, validateImage } from "./images";

type User = Profile & { passHash: string; confirmed: boolean };
type Token = { email: string; kind: "confirm" | "reset"; expires: number; used: boolean };
type Db = {
  users: User[];
  tokens: Record<string, Token>;
  workspaces: Workspace[];
  members: { workspaceId: string; userId: string; role: Role }[];
  canvases: Canvas[];
  elements: CanvasElement[];
  sources: Source[];
};

const KEY = "nexora:db";
const SESSION = "nexora:session";
const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { users: [], tokens: {}, workspaces: [], members: [], canvases: [], elements: [], sources: [] };
}
function save(db: Db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    throw new ApiError("Не удалось сохранить: хранилище браузера переполнено", "network");
  }
}
function tx<T>(fn: (db: Db) => T): T {
  const db = load();
  const r = fn(db);
  save(db);
  return r;
}
const delay = () => new Promise((r) => setTimeout(r, 120));

async function hash(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sessionUserId(): string | null {
  try { return localStorage.getItem(SESSION); } catch { return null; }
}
function me(db: Db): User {
  const id = sessionUserId();
  const u = id && db.users.find((x) => x.id === id);
  if (!u) throw new ApiError("Войдите в систему", "auth");
  return u;
}
function role(db: Db, wsId: string, userId: string): Role | null {
  return db.members.find((m) => m.workspaceId === wsId && m.userId === userId)?.role ?? null;
}
/** Тот же ответ для чужого и несуществующего объекта (критерий №35) */
function requireWs(db: Db, wsId: string, need: "read" | "edit" | "owner") {
  const u = me(db);
  const ws = db.workspaces.find((w) => w.id === wsId);
  const r = ws && role(db, wsId, u.id);
  if (!ws || !r || (ws.deletedAt && need !== "owner")) throw new ApiError("Не найдено", "not_found");
  if (need === "edit" && r === "viewer") throw new ApiError("Недостаточно прав", "forbidden");
  if (need === "owner" && r !== "owner") throw new ApiError("Не найдено", "not_found");
  return { u, ws, r };
}
function requireCanvas(db: Db, canvasId: string, need: "read" | "edit") {
  const c = db.canvases.find((x) => x.id === canvasId);
  if (!c) throw new ApiError("Не найдено", "not_found");
  requireWs(db, c.workspaceId, need);
  return c;
}
function purgeExpired(db: Db) {
  const edge = Date.now() - TRASH_DAYS * 864e5;
  const dead = new Set(db.workspaces.filter((w) => w.deletedAt && Date.parse(w.deletedAt) < edge).map((w) => w.id));
  const deadCanvases = new Set(
    db.canvases.filter((c) => dead.has(c.workspaceId) || (c.deletedAt && Date.parse(c.deletedAt) < edge)).map((c) => c.id),
  );
  db.workspaces = db.workspaces.filter((w) => !dead.has(w.id));
  db.members = db.members.filter((m) => !dead.has(m.workspaceId));
  db.sources = db.sources.filter((s) => !dead.has(s.workspaceId));
  db.canvases = db.canvases.filter((c) => !deadCanvases.has(c.id));
  db.elements = db.elements.filter((e) => !deadCanvases.has(e.canvasId));
}
function card(db: Db, ws: Workspace, userId: string): WorkspaceCard {
  return {
    ...ws,
    role: role(db, ws.id, userId)!,
    pageCount: db.canvases.filter((c) => c.workspaceId === ws.id && !c.deletedAt).length,
  };
}
function newCanvas(db: Db, workspaceId: string, name?: string): Canvas {
  const siblings = db.canvases.filter((c) => c.workspaceId === workspaceId && !c.deletedAt);
  const c: Canvas = {
    id: uid(), workspaceId,
    name: name?.trim() || `Страница ${siblings.length + 1}`,
    backgroundType: "grid", backgroundSpacing: 24,
    position: siblings.reduce((m, x) => Math.max(m, x.position), 0) + 1,
    deletedAt: null, createdAt: now(), updatedAt: now(),
  };
  db.canvases.push(c);
  return c;
}
function touchWs(db: Db, wsId: string) {
  const w = db.workspaces.find((x) => x.id === wsId);
  if (w) w.updatedAt = now();
}

/** Источник без содержимого файла — то, что видит интерфейс */
const pub = (s: Source): Source => { const c = { ...s }; delete c.dataUrl; return c; };

/* ======================= AUTH ======================= */
export const localAuth: AuthApi & { demoInbox(email: string): { kind: string; url: string } | null } = {
  async current() {
    const db = load();
    const id = sessionUserId();
    const u = db.users.find((x) => x.id === id);
    return u ? { id: u.id, email: u.email, displayName: u.displayName } : null;
  },
  async signUp(email, password, displayName) {
    await delay();
    const h = await hash(password);
    tx((db) => {
      const e = email.trim().toLowerCase();
      if (!db.users.some((u) => u.email === e)) {
        db.users.push({ id: uid(), email: e, displayName: displayName.trim(), passHash: h, confirmed: false });
      }
      db.tokens[uid()] = { email: e, kind: "confirm", expires: Date.now() + 864e5, used: false };
    });
  },
  async signIn(email, password) {
    await delay();
    const h = await hash(password);
    const db = load();
    const u = db.users.find((x) => x.email === email.trim().toLowerCase());
    if (!u || u.passHash !== h) throw new ApiError("Неверный e-mail или пароль", "auth");
    if (!u.confirmed) throw new ApiError("Подтвердите e-mail — ссылка в письме", "auth");
    localStorage.setItem(SESSION, u.id);
  },
  async signOut() { localStorage.removeItem(SESSION); },
  async resendConfirmation(email) {
    await delay();
    tx((db) => {
      const e = email.trim().toLowerCase();
      if (db.users.some((u) => u.email === e && !u.confirmed))
        db.tokens[uid()] = { email: e, kind: "confirm", expires: Date.now() + 864e5, used: false };
    });
  },
  async requestPasswordReset(email) {
    await delay();
    tx((db) => {
      const e = email.trim().toLowerCase();
      // ответ одинаковый для любого адреса (п. 4.2.2)
      if (db.users.some((u) => u.email === e))
        db.tokens[uid()] = { email: e, kind: "reset", expires: Date.now() + 36e5, used: false };
    });
  },
  async updatePassword(password) {
    const h = await hash(password);
    tx((db) => { me(db).passHash = h; });
  },
  async updateProfile(displayName) {
    tx((db) => { me(db).displayName = displayName.trim(); });
  },
  /** Демо-«почтовый ящик»: последняя действующая ссылка для адреса */
  demoInbox(email) {
    const db = load();
    const e = email.trim().toLowerCase();
    const entry = Object.entries(db.tokens).reverse()
      .find(([, t]) => t.email === e && !t.used && t.expires > Date.now());
    if (!entry) return null;
    const [token, t] = entry;
    return { kind: t.kind, url: t.kind === "confirm" ? `/login?confirm=${token}` : `/reset-password?token=${token}` };
  },
};

/** Подтверждение/сброс по токену из «письма» (одноразово) */
export async function consumeToken(token: string, kind: "confirm" | "reset", newPassword?: string) {
  const h = newPassword ? await hash(newPassword) : null;
  return tx((db) => {
    const t = db.tokens[token];
    if (!t || t.kind !== kind || t.used || t.expires < Date.now()) throw new ApiError("Ссылка устарела", "invalid");
    t.used = true;
    const u = db.users.find((x) => x.email === t.email)!;
    if (kind === "confirm") u.confirmed = true;
    if (kind === "reset" && h) { u.passHash = h; u.confirmed = true; }
    localStorage.setItem(SESSION, u.id);
  });
}

/* ======================= DATA ======================= */
export const localData: DataApi = {
  async listWorkspaces() {
    await delay();
    return tx((db) => {
      purgeExpired(db);
      const u = me(db);
      return db.workspaces
        .filter((w) => !w.deletedAt && role(db, w.id, u.id))
        .map((w) => card(db, w, u.id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  },
  async listTrash() {
    const db = load();
    const u = me(db);
    return db.workspaces.filter((w) => w.deletedAt && w.ownerId === u.id).map((w) => card(db, w, u.id));
  },
  async getWorkspace(id) {
    const db = load();
    try { const { ws, u } = requireWs(db, id, "read"); return card(db, ws, u.id); } catch { return null; }
  },
  async createWorkspace(name) {
    await delay();
    return tx((db) => {
      const u = me(db);
      const ws: Workspace = {
        id: uid(), ownerId: u.id, name: name?.trim() || "Новая тетрадь",
        createdAt: now(), updatedAt: now(), deletedAt: null,
      };
      db.workspaces.push(ws);
      db.members.push({ workspaceId: ws.id, userId: u.id, role: "owner" });
      newCanvas(db, ws.id);
      return card(db, ws, u.id);
    });
  },
  async renameWorkspace(id, name) {
    tx((db) => { const { ws } = requireWs(db, id, "owner"); ws.name = name.trim(); ws.updatedAt = now(); });
  },
  async trashWorkspace(id) {
    tx((db) => { const { ws } = requireWs(db, id, "owner"); ws.deletedAt = now(); });
  },
  async restoreWorkspace(id) {
    tx((db) => { const { ws } = requireWs(db, id, "owner"); ws.deletedAt = null; ws.updatedAt = now(); });
  },

  async listCanvases(workspaceId) {
    const db = load();
    requireWs(db, workspaceId, "read");
    return db.canvases.filter((c) => c.workspaceId === workspaceId && !c.deletedAt).sort((a, b) => a.position - b.position);
  },
  async listCanvasTrash(workspaceId) {
    const db = load();
    requireWs(db, workspaceId, "read");
    return db.canvases.filter((c) => c.workspaceId === workspaceId && c.deletedAt);
  },
  async getCanvas(id) {
    const db = load();
    try { const c = requireCanvas(db, id, "read"); return c.deletedAt ? null : c; } catch { return null; }
  },
  async createCanvas(workspaceId, name) {
    return tx((db) => { requireWs(db, workspaceId, "edit"); touchWs(db, workspaceId); return newCanvas(db, workspaceId, name); });
  },
  async updateCanvas(id, patch) {
    tx((db) => { const c = requireCanvas(db, id, "edit"); Object.assign(c, patch, { updatedAt: now() }); touchWs(db, c.workspaceId); });
  },
  async duplicateCanvas(id) {
    return tx((db) => {
      const src = requireCanvas(db, id, "edit");
      const copy = newCanvas(db, src.workspaceId, `${src.name} (копия)`);
      copy.backgroundType = src.backgroundType;
      copy.backgroundSpacing = src.backgroundSpacing;
      copy.position = src.position + 0.5;
      const groupMap = new Map<string, string>();
      const idMap = new Map<string, string>();
      const els = db.elements.filter((e) => e.canvasId === id);
      els.forEach((e) => idMap.set(e.id, uid()));
      for (const e of els) {
        const groupId = e.groupId ? idMap.get(e.groupId) ?? groupMap.get(e.groupId) ?? (groupMap.set(e.groupId, uid()), groupMap.get(e.groupId)!) : null;
        const content = { ...e.content };
        for (const k of ["fromId", "toId"]) if (typeof content[k] === "string") content[k] = idMap.get(content[k] as string) ?? null;
        db.elements.push({ ...e, id: idMap.get(e.id)!, canvasId: copy.id, groupId, content, updatedAt: now() });
      }
      const ordered = db.canvases.filter((c) => c.workspaceId === src.workspaceId && !c.deletedAt).sort((a, b) => a.position - b.position);
      ordered.forEach((c, i) => (c.position = i + 1));
      return copy;
    });
  },
  async trashCanvas(id) {
    tx((db) => { const c = requireCanvas(db, id, "edit"); c.deletedAt = now(); });
  },
  async restoreCanvas(id) {
    tx((db) => {
      const c = db.canvases.find((x) => x.id === id);
      if (!c) throw new ApiError("Не найдено", "not_found");
      requireWs(db, c.workspaceId, "edit");
      c.deletedAt = null;
    });
  },
  async reorderCanvases(workspaceId, orderedIds) {
    tx((db) => {
      requireWs(db, workspaceId, "edit");
      orderedIds.forEach((id, i) => { const c = db.canvases.find((x) => x.id === id); if (c) c.position = i + 1; });
    });
  },

  async listElements(canvasId) {
    const db = load();
    requireCanvas(db, canvasId, "read");
    return db.elements.filter((e) => e.canvasId === canvasId);
  },
  async upsertElements(els) {
    if (!els.length) return;
    tx((db) => {
      const checked = new Set<string>();
      for (const e of els) {
        if (!checked.has(e.canvasId)) { requireCanvas(db, e.canvasId, "edit"); checked.add(e.canvasId); }
        const i = db.elements.findIndex((x) => x.id === e.id);
        const next = { ...e, updatedAt: now() };
        if (i >= 0) db.elements[i] = next; else db.elements.push(next);
      }
    });
  },
  async deleteElements(ids) {
    tx((db) => {
      const set = new Set(ids);
      for (const e of db.elements) if (set.has(e.id)) requireCanvas(db, e.canvasId, "edit");
      db.elements = db.elements.filter((e) => !set.has(e.id));
    });
  },

  async listSources(workspaceId) {
    const db = load();
    requireWs(db, workspaceId, "read");
    return db.sources.filter((s) => s.workspaceId === workspaceId).map(pub);
  },
  async uploadSource(workspaceId, file) {
    const db0 = load();
    requireWs(db0, workspaceId, "edit");
    const existing = db0.sources.filter((s) => s.workspaceId === workspaceId);
    checkUpload(file, existing);
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(new ApiError("Не удалось прочитать файл", "invalid"));
      r.readAsDataURL(file);
    });
    return tx((db) => {
      const s: Source = {
        id: uid(), workspaceId, originalName: file.name, mimeType: sourceMime(file),
        size: file.size, status: "pending", errorMessage: null, createdAt: now(), dataUrl,
      };
      db.sources.push(s);
      touchWs(db, workspaceId);
      return pub(s);
    });
  },
  async uploadImage(workspaceId, file) {
    requireWs(load(), workspaceId, "edit");
    validateImage(file);
    const { width, height } = await imageSize(file);
    return { name: file.name, mime: file.type, naturalWidth: width, naturalHeight: height, dataUrl: await demoDataUrl(file) };
  },
  async imageUrl() {
    throw new ApiError("В демо-режиме изображения хранятся в объекте", "not_found");
  },
  async deleteSource(id) {
    tx((db) => {
      const s = db.sources.find((x) => x.id === id);
      if (!s) throw new ApiError("Не найдено", "not_found");
      requireWs(db, s.workspaceId, "edit");
      db.sources = db.sources.filter((x) => x.id !== id);
    });
  },
};
