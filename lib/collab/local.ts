"use client";
/** Демо-реализация совместной работы на localStorage. Повторяет правила SQL-функций спринта 6. */
import { ApiError } from "@/lib/data/api";
import { localStore as S, type LocalDb, type LocalPublication } from "@/lib/data/local";
import type { Role } from "@/lib/types";
import { InvitationError } from "./errors";
import {
  INVITATION_HOURS, invitationStatus, invitePath, normalizeEmail, publicPath,
  type CollabApi, type Invitation, type Publication, type PublishedCanvas,
} from "./types";

const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

const toPublication = (p: LocalPublication): Publication => ({
  canvasId: p.canvasId, slug: p.slug, isActive: p.isActive, publishedAt: p.publishedAt, path: publicPath(p.slug),
});
function editableCanvas(db: LocalDb, canvasId: string) {
  const c = S.requireCanvas(db, canvasId, "edit");
  if (c.deletedAt) throw new ApiError("Не найдено", "not_found");
  return c;
}
function ownerOf(db: LocalDb, workspaceId: string) {
  return S.requireWs(db, workspaceId, "owner");
}
function memberRow(db: LocalDb, workspaceId: string, userId: string) {
  const m = db.members.find((x) => x.workspaceId === workspaceId && x.userId === userId);
  if (!m || m.role === "owner") throw new ApiError("Участник не найден", "not_found");
  return m;
}

/** Демо-«письмо» с приглашением: последняя ссылка для адреса (как demoInbox для входа) */
const INBOX = "nexora:invite-inbox";
function rememberInvite(email: string, link: string) {
  try {
    const box = JSON.parse(localStorage.getItem(INBOX) || "{}") as Record<string, string>;
    box[email] = link;
    localStorage.setItem(INBOX, JSON.stringify(box));
  } catch {}
}
export function demoInviteInbox(email: string): string | null {
  try { return (JSON.parse(localStorage.getItem(INBOX) || "{}") as Record<string, string>)[email.trim().toLowerCase()] ?? null; }
  catch { return null; }
}

export const localCollab: CollabApi = {
  async listMembers(workspaceId) {
    const db = S.load();
    const { u, r } = S.requireWs(db, workspaceId, "read");
    const order: Record<Role, number> = { owner: 0, editor: 1, viewer: 2 };
    return db.members.filter((m) => m.workspaceId === workspaceId).map((m) => {
      const user = db.users.find((x) => x.id === m.userId);
      return {
        userId: m.userId, displayName: user?.displayName ?? "", role: m.role, joinedAt: "", isMe: m.userId === u.id,
        email: r === "owner" || m.userId === u.id ? user?.email ?? null : null,
      };
    }).sort((a, b) => order[a.role] - order[b.role] || a.userId.localeCompare(b.userId));
  },
  async listInvitations(workspaceId) {
    const db = S.load();
    ownerOf(db, workspaceId);
    return (db.invitations ?? []).filter((i) => i.workspaceId === workspaceId)
      .map((i): Invitation => ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt, expiresAt: i.expiresAt, status: invitationStatus(i) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async invite(workspaceId, rawEmail, role) {
    await S.delay();
    const email = normalizeEmail(rawEmail);
    if (!email) throw new ApiError("Введите корректный e-mail", "invalid");
    if (role !== "editor" && role !== "viewer") throw new ApiError("Роль: редактор или наблюдатель", "invalid");
    const token = randomHex(32);
    const tokenHash = await S.hash(token);
    const invitation = S.tx((db) => {
      const { ws } = ownerOf(db, workspaceId);
      if (ws.deletedAt) throw new ApiError("Не найдено", "not_found");
      const memberIds = new Set(db.members.filter((m) => m.workspaceId === workspaceId).map((m) => m.userId));
      if (db.users.some((u) => memberIds.has(u.id) && u.email === email)) {
        throw new ApiError("Пользователь уже является участником", "invalid");
      }
      db.invitations ??= [];
      for (const i of db.invitations) {
        if (i.workspaceId === workspaceId && i.email === email && !i.acceptedAt && !i.revokedAt) i.revokedAt = S.now();
      }
      const createdAt = S.now();
      const row = {
        id: crypto.randomUUID(), workspaceId, email, tokenHash, role, createdAt,
        expiresAt: new Date(Date.parse(createdAt) + INVITATION_HOURS * 36e5).toISOString(), acceptedAt: null, revokedAt: null,
      };
      db.invitations.push(row);
      return row;
    });
    const link = invitePath(token);
    rememberInvite(email, link);
    return {
      invitation: { id: invitation.id, email, role, createdAt: invitation.createdAt, expiresAt: invitation.expiresAt, status: "pending" },
      link, emailed: false,
    };
  },
  async revokeInvitation(invitationId) {
    S.tx((db) => {
      const i = db.invitations?.find((x) => x.id === invitationId);
      if (!i) throw new ApiError("Не найдено", "not_found");
      ownerOf(db, i.workspaceId);
      if (!i.acceptedAt && !i.revokedAt) i.revokedAt = S.now();
    });
  },
  async acceptInvitation(token) {
    const tokenHash = await S.hash(token);
    return S.tx((db) => {
      let u;
      try { u = S.me(db); } catch { throw new InvitationError("auth"); }
      const i = db.invitations?.find((x) => x.tokenHash === tokenHash);
      const ws = i && db.workspaces.find((w) => w.id === i.workspaceId && !w.deletedAt);
      if (!i || !ws) throw new InvitationError("invalid");
      if (i.revokedAt) throw new InvitationError("revoked");
      if (i.acceptedAt) throw new InvitationError("used");
      if (Date.parse(i.expiresAt) <= Date.now()) throw new InvitationError("expired");
      if (u.email !== i.email) throw new InvitationError("email_mismatch");
      if (!u.confirmed) throw new InvitationError("email_unverified");
      if (!db.members.some((m) => m.workspaceId === i.workspaceId && m.userId === u.id)) {
        db.members.push({ workspaceId: i.workspaceId, userId: u.id, role: i.role });
      }
      i.acceptedAt = S.now();
      return i.workspaceId;
    });
  },
  async setRole(workspaceId, userId, role) {
    if (role !== "editor" && role !== "viewer") throw new ApiError("Роль: редактор или наблюдатель", "invalid");
    S.tx((db) => { ownerOf(db, workspaceId); memberRow(db, workspaceId, userId).role = role; });
  },
  async removeMember(workspaceId, userId) {
    S.tx((db) => {
      const { u, r } = S.requireWs(db, workspaceId, "read");
      if (userId !== u.id && r !== "owner") throw new ApiError("Недостаточно прав", "forbidden");
      memberRow(db, workspaceId, userId);
      db.members = db.members.filter((m) => !(m.workspaceId === workspaceId && m.userId === userId));
    });
  },
  async leave(workspaceId) {
    const db = S.load();
    const u = S.me(db);
    return localCollab.removeMember(workspaceId, u.id);
  },
  async transferOwnership(workspaceId, userId) {
    S.tx((db) => {
      const { u, ws } = ownerOf(db, workspaceId);
      if (userId === u.id) throw new ApiError("Выберите другого участника", "invalid");
      const next = memberRow(db, workspaceId, userId);
      db.members.find((m) => m.workspaceId === workspaceId && m.userId === u.id)!.role = "editor";
      next.role = "owner";
      ws.ownerId = userId;
      ws.updatedAt = S.now();
    });
  },

  async getPublication(canvasId) {
    const db = S.load();
    S.requireCanvas(db, canvasId, "read");
    const p = db.publications?.find((x) => x.canvasId === canvasId);
    return p ? toPublication(p) : null;
  },
  async publish(canvasId) {
    return S.tx((db) => {
      const c = editableCanvas(db, canvasId);
      db.publications ??= [];
      let p = db.publications.find((x) => x.canvasId === canvasId);
      if (!p) {
        p = { canvasId, workspaceId: c.workspaceId, slug: randomHex(24), isActive: true, publishedAt: S.now() };
        db.publications.push(p);
      } else if (!p.isActive) {
        Object.assign(p, { slug: randomHex(24), isActive: true, publishedAt: S.now() });
      }
      return toPublication(p);
    });
  },
  async unpublish(canvasId) {
    S.tx((db) => {
      S.requireCanvas(db, canvasId, "edit");
      const p = db.publications?.find((x) => x.canvasId === canvasId);
      if (p) p.isActive = false;
    });
  },
  async getPublishedCanvas(slug) {
    return publishedProjection(S.load(), slug);
  },
};

const STYLE_KEYS = new Set(["color", "fill", "stroke", "fontSize", "fontWeight", "align", "bold", "italic", "underline", "strike", "opacity"]);
const HIDDEN_TYPES = new Set(["image", "source", "source_fragment"]);

/** Та же белая проекция, что get_published_canvas: без файлов, источников и служебных полей */
export function publishedProjection(db: LocalDb, slug: string): PublishedCanvas | null {
  const p = db.publications?.find((x) => x.slug === slug && x.isActive);
  const c = p && db.canvases.find((x) => x.id === p.canvasId && !x.deletedAt);
  const ws = c && db.workspaces.find((w) => w.id === c.workspaceId && !w.deletedAt);
  if (!p || !c || !ws) return null;
  const pick = (type: string, content: Record<string, unknown>) => {
    const str = (k: string) => (typeof content[k] === "string" ? { [k]: content[k] } : {});
    const base = ["text", "note", "diagram_node"].includes(type) ? str("text")
      : type === "formula" ? str("latex")
      : type === "shape" ? { ...str("kind"), ...str("text") }
      : type === "connector" ? { ...str("fromId"), ...str("toId") } : {};
    return typeof content.documentOrder === "number" && Number.isFinite(content.documentOrder)
      ? { ...base, documentOrder: content.documentOrder } : base;
  };
  return {
    name: c.name, background_type: c.backgroundType, background_spacing: c.backgroundSpacing,
    elements: db.elements.filter((e) => e.canvasId === c.id && !HIDDEN_TYPES.has(e.type))
      .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))
      .map((e) => ({
        id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, rotation: e.rotation,
        z_index: e.zIndex, group_id: e.groupId, content_json: pick(e.type, e.content),
        style_json: Object.fromEntries(Object.entries(e.style).filter(([k, v]) =>
          STYLE_KEYS.has(k) && ["string", "number", "boolean"].includes(typeof v))),
      })),
  };
}
