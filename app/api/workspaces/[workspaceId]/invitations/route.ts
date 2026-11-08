import { getServerEnv } from "@/lib/env/server";
import { invitationLetter, sendInvitation } from "@/lib/collab/mail";
import { noStore, pgFailure, respond, RouteError, userClient, UUID } from "@/lib/collab/server";
import { invitePath, normalizeEmail, type InviteResult } from "@/lib/collab/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Приглашение по e-mail (ТЗ 4.2.3): создаёт одноразовый токен на 72 часа и отправляет письмо */
export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await params;
    if (!UUID.test(workspaceId)) throw new RouteError(400, "Неверная тетрадь");
    const body = (await request.json().catch(() => null)) as { email?: unknown; role?: unknown } | null;
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : null;
    const role = body?.role === "editor" || body?.role === "viewer" ? body.role : null;
    if (!email) throw new RouteError(400, "Введите корректный e-mail");
    if (!role) throw new RouteError(400, "Роль: редактор или наблюдатель");

    const { sb, user } = await userClient(request);
    // Владельца проверяет SQL-функция; токен в базе хранится только как хэш.
    const created = await sb.rpc("create_workspace_invitation", { p_workspace_id: workspaceId, p_email: email, p_role: role });
    if (created.error) pgFailure(created.error);
    const row = (created.data as { invitation_id: string; token: string; expires_at: string }[])[0];
    if (!row) throw new RouteError(503, "Сервис временно недоступен");

    const [{ data: ws }, { data: profile }] = await Promise.all([
      sb.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
      sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);
    const link = new URL(invitePath(row.token), getServerEnv().appUrl).toString();
    const emailed = await sendInvitation(email, invitationLetter({
      workspaceName: ws?.name ?? "Nexora", inviterName: profile?.display_name ?? "", role, link,
    }));
    const result: InviteResult = {
      invitation: { id: row.invitation_id, email, role, createdAt: new Date().toISOString(), expiresAt: row.expires_at, status: "pending" },
      link, emailed,
    };
    return Response.json(result, { status: 201, headers: noStore });
  } catch (error) {
    return respond(error);
  }
}
