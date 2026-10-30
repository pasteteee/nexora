import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env/public";
import { getSupabaseSecretKey } from "@/lib/env/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export function admin() {
  return createClient(getPublicEnv().supabaseUrl, getSupabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function access(workspaceId: string, write = false) {
  if (!uuid(workspaceId)) throw new HttpError(400, "Неверная тетрадь");
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new HttpError(401, "Войдите в систему");
  const { data } = await sb
    .from("workspace_members")
    .select("role,workspaces!inner(deleted_at)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .is("workspaces.deleted_at", null)
    .maybeSingle();
  if (!data || (write && data.role === "viewer"))
    throw new HttpError(403, "Нет доступа к этой операции");
  return { sb, user, role: data.role };
}
export function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "Не удалось выполнить операцию. Попробуйте ещё раз.",
    },
    { status: error instanceof HttpError ? error.status : 503 },
  );
}
