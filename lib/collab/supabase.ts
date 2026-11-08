"use client";
/** Совместная работа поверх Supabase: права проверяют SQL-функции и RLS, клиент только отображает. */
import { ApiError } from "@/lib/data/api";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";
import { InvitationError } from "./errors";
import {
  invitationFailure, invitationStatus, publicPath,
  type CollabApi, type Invitation, type InviteResult, type Publication, type PublishedCanvas,
} from "./types";

const sb = () => supabaseBrowser();
type PgError = { message: string; code?: string } | null;

function fail(error: NonNullable<PgError>): never {
  if (error.code === "23505") throw new ApiError("Пользователь уже является участником", "invalid");
  if (error.code === "22023") throw new ApiError("Введите корректный e-mail", "invalid");
  if (error.code === "P0002") throw new ApiError("Участник не найден", "not_found");
  if (error.code === "42501") throw new ApiError("Недостаточно прав", "forbidden");
  throw new ApiError("Не удалось выполнить операцию. Попробуйте ещё раз", "network");
}
function check<T>(r: { data: T; error: PgError }): T {
  if (r.error) fail(r.error);
  return r.data;
}
async function me() {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new ApiError("Войдите в систему", "auth");
  return data.user.id;
}

/** Серверные операции с повторной проверкой прав (Приложение 3 ТЗ) */
async function server<T>(path: string, init: RequestInit): Promise<T> {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Войдите в систему", "auth");
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError("Нет соединения с сервером", "network");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    const code = res.status === 401 ? "auth" : res.status === 403 ? "forbidden" : res.status === 404 ? "not_found"
      : res.status === 400 || res.status === 409 ? "invalid" : "network";
    throw new ApiError(body.error || "Не удалось выполнить операцию", code);
  }
  return body;
}

const toPublication = (r: { canvas_id: string; slug: string; is_active: boolean; published_at: string }): Publication => ({
  canvasId: r.canvas_id, slug: r.slug, isActive: r.is_active, publishedAt: r.published_at, path: publicPath(r.slug),
});

export const supabaseCollab: CollabApi = {
  async listMembers(workspaceId) {
    const [rows, myId] = await Promise.all([
      sb().rpc("list_workspace_members", { p_workspace_id: workspaceId }).then(check),
      me(),
    ]);
    return ((rows ?? []) as { user_id: string; display_name: string; email: string | null; role: Role; joined_at: string }[])
      .map((r) => ({ userId: r.user_id, displayName: r.display_name, email: r.email, role: r.role, joinedAt: r.joined_at, isMe: r.user_id === myId }));
  },
  async listInvitations(workspaceId) {
    const rows = check(await sb().from("workspace_invitations")
      .select("id, email, role, created_at, expires_at, accepted_at, revoked_at")
      .eq("workspace_id", workspaceId).order("created_at", { ascending: false }));
    return (rows ?? []).map((r): Invitation => ({
      id: r.id, email: r.email, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at,
      status: invitationStatus({ acceptedAt: r.accepted_at, revokedAt: r.revoked_at, expiresAt: r.expires_at }),
    }));
  },
  async invite(workspaceId, email, role) {
    return server<InviteResult>(`/api/workspaces/${workspaceId}/invitations`, {
      method: "POST", body: JSON.stringify({ email, role }),
    });
  },
  async revokeInvitation(invitationId) {
    check(await sb().rpc("revoke_workspace_invitation", { p_invitation_id: invitationId }));
  },
  async acceptInvitation(token) {
    const { data, error } = await sb().rpc("accept_workspace_invitation", { p_token: token });
    if (error) throw new InvitationError(invitationFailure(error.message));
    return data as string;
  },
  async setRole(workspaceId, userId, role) {
    check(await sb().rpc("set_member_role", { p_workspace_id: workspaceId, p_user_id: userId, p_role: role }));
  },
  async removeMember(workspaceId, userId) {
    check(await sb().rpc("remove_workspace_member", { p_workspace_id: workspaceId, p_user_id: userId }));
  },
  async leave(workspaceId) {
    await supabaseCollab.removeMember(workspaceId, await me());
  },
  async transferOwnership(workspaceId, userId) {
    check(await sb().rpc("transfer_workspace_ownership", { p_workspace_id: workspaceId, p_new_owner_id: userId }));
  },

  async getPublication(canvasId) {
    const r = check(await sb().from("publications").select("canvas_id, slug, is_active, published_at")
      .eq("canvas_id", canvasId).maybeSingle());
    return r ? toPublication(r) : null;
  },
  async publish(canvasId) {
    return (await server<{ publication: Publication }>(`/api/publish/${canvasId}`, { method: "POST" })).publication;
  },
  async unpublish(canvasId) {
    await server(`/api/publish/${canvasId}`, { method: "DELETE" });
  },
  async getPublishedCanvas(slug) {
    const { data, error } = await sb().rpc("get_published_canvas", { p_slug: slug });
    if (error) throw new ApiError("Не удалось загрузить страницу", "network");
    return (data as PublishedCanvas | null) ?? null;
  },
};
