import type { Role } from "@/lib/types";

/** Участник тетради. E-mail других участников видит только владелец. */
export interface Member {
  userId: string;
  displayName: string;
  email: string | null;
  role: Role;
  joinedAt: string;
  isMe: boolean;
}

export type InvitationRole = Exclude<Role, "owner">;
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  id: string;
  email: string;
  role: InvitationRole;
  createdAt: string;
  expiresAt: string;
  status: InvitationStatus;
}

export interface InviteResult {
  invitation: Invitation;
  /** Ссылка для принятия: её можно передать вручную, если письмо не отправлено */
  link: string;
  emailed: boolean;
}

export interface Publication {
  canvasId: string;
  slug: string;
  isActive: boolean;
  publishedAt: string;
  /** Относительный путь публичной страницы */
  path: string;
}

/** Ответ публичной проекции — тот же JSON, что у RPC get_published_canvas */
export interface PublishedCanvas {
  name: string;
  background_type: string;
  background_spacing: number;
  elements: {
    id: string; type: string; x: number; y: number; width: number; height: number;
    rotation: number; z_index: number; group_id: string | null;
    content_json: Record<string, unknown>; style_json: Record<string, unknown>;
  }[];
}

export type InvitationFailure = "invalid" | "revoked" | "used" | "expired" | "email_mismatch" | "email_unverified" | "auth";

export interface CollabApi {
  listMembers(workspaceId: string): Promise<Member[]>;
  /** Только владелец */
  listInvitations(workspaceId: string): Promise<Invitation[]>;
  invite(workspaceId: string, email: string, role: InvitationRole): Promise<InviteResult>;
  revokeInvitation(invitationId: string): Promise<void>;
  /** Возвращает id тетради */
  acceptInvitation(token: string): Promise<string>;
  setRole(workspaceId: string, userId: string, role: InvitationRole): Promise<void>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
  /** Выйти из чужой тетради */
  leave(workspaceId: string): Promise<void>;
  transferOwnership(workspaceId: string, userId: string): Promise<void>;

  getPublication(canvasId: string): Promise<Publication | null>;
  publish(canvasId: string): Promise<Publication>;
  unpublish(canvasId: string): Promise<void>;
  getPublishedCanvas(slug: string): Promise<PublishedCanvas | null>;
}

export const publicPath = (slug: string) => `/p/${slug}`;
export const invitePath = (token: string) => `/app/invite/${token}`;
export const INVITATION_HOURS = 72;

export const roleLabel: Record<Role, string> = { owner: "Владелец", editor: "Редактор", viewer: "Наблюдатель" };

export const invitationMessages: Record<InvitationFailure, string> = {
  invalid: "Приглашение не найдено или тетрадь удалена",
  revoked: "Приглашение отозвано владельцем",
  used: "Приглашение уже принято",
  expired: "Срок приглашения (72 часа) истёк. Попросите владельца пригласить вас снова",
  email_mismatch: "Приглашение отправлено на другой адрес. Войдите с тем e-mail, на который пришло письмо",
  email_unverified: "Подтвердите e-mail в профиле, чтобы принять приглашение",
  auth: "Войдите, чтобы принять приглашение",
};

/** Код ошибки из сообщения RPC accept_workspace_invitation */
export function invitationFailure(message: string): InvitationFailure {
  const m = /invitation_(invalid|revoked|used|expired|email_mismatch|email_unverified)/.exec(message);
  if (m) return m[1] as InvitationFailure;
  if (/Authentication required/i.test(message)) return "auth";
  return "invalid";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(value: string): string | null {
  const e = value.trim().toLowerCase();
  return e.length <= 320 && EMAIL.test(e) ? e : null;
}

export function invitationStatus(i: { acceptedAt?: string | null; revokedAt?: string | null; expiresAt: string }, now = Date.now()): InvitationStatus {
  if (i.acceptedAt) return "accepted";
  if (i.revokedAt) return "revoked";
  return Date.parse(i.expiresAt) <= now ? "expired" : "pending";
}
