import "server-only";
import { limits } from "@/lib/config";

/** Who may use the paid AI features (assistant, selection actions, photo recognition). */
type Who = { id: string; email?: string | null; email_confirmed_at?: string | null };

export type AiAccess = {
  /** The user is listed as an administrator on the server. */
  admin: boolean;
  /** Requests per hour this user may make; 0 means the AI features are off for them. */
  perHour: number;
  enabled: boolean;
};

export const AI_ADMIN_ONLY = "ИИ-функции сейчас доступны только администратору сервиса";

const list = (value: string | undefined) =>
  (value ?? "").split(/[\s,;]+/).map((v) => v.trim().toLowerCase()).filter(Boolean);

/**
 * Administrators come from server-only env: ADMIN_USER_IDS (Supabase user ids) and ADMIN_EMAILS.
 * An e-mail counts only once it is confirmed, so nobody can claim an admin address by signing up with it.
 */
export function isAiAdmin(user: Who): boolean {
  if (list(process.env.ADMIN_USER_IDS).includes(user.id.toLowerCase())) return true;
  const email = user.email?.trim().toLowerCase();
  return Boolean(email && user.email_confirmed_at && list(process.env.ADMIN_EMAILS).includes(email));
}

export function aiAccess(user: Who): AiAccess {
  const admin = isAiAdmin(user);
  const perHour = Math.max(0, Math.floor(admin ? limits.aiAdminRequestsPerHour : limits.aiUserRequestsPerHour));
  return { admin, perHour, enabled: perHour > 0 };
}
