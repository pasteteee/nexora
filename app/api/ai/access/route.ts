import { aiAccess, AI_ADMIN_ONLY } from "@/lib/ai/access";
import { supabaseServer } from "@/lib/supabase/server";

/** Whether the signed-in user may use the AI features; the UI hides or explains them from this. */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const headers = { "Cache-Control": "no-store" };
  if (!user) return Response.json({ enabled: false, admin: false, perHour: 0, reason: "Войдите в систему" }, { status: 401, headers });
  const ai = aiAccess(user);
  return Response.json({ ...ai, reason: ai.enabled ? null : AI_ADMIN_ONLY }, { headers });
}
