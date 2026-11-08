import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env/public";

export const noStore = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RouteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Клиент от имени пользователя запроса: публичный ключ + его JWT, права проверяют RLS и SQL-функции */
export async function userClient(request: Request) {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9._-]{1,8192})$/i)?.[1];
  if (!token) throw new RouteError(401, "Войдите в систему");
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();
  const sb = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new RouteError(401, "Сессия истекла, войдите снова");
  return { sb, user: data.user };
}

/** Ошибка Postgres → ответ без внутренних подробностей */
export function pgFailure(error: { code?: string; message: string }): never {
  if (error.code === "54000") throw new RouteError(429, "Слишком много приглашений за час. Попробуйте позже");
  if (error.code === "23505") throw new RouteError(409, "Пользователь уже является участником");
  if (error.code === "22023" || error.code === "23514") throw new RouteError(400, "Проверьте e-mail и роль");
  if (error.code === "42501") throw new RouteError(403, "Недостаточно прав");
  throw new RouteError(503, "Сервис временно недоступен");
}

export function respond(error: unknown) {
  if (error instanceof RouteError) return Response.json({ error: error.message }, { status: error.status, headers: noStore });
  return Response.json({ error: "Не удалось выполнить операцию. Попробуйте ещё раз" }, { status: 503, headers: noStore });
}
