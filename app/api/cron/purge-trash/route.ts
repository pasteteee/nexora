import { timingSafeEqual } from "node:crypto";
import { admin } from "@/lib/knowledge/server";
import { purgeExpiredTrash, type PurgeClient } from "@/lib/trash/purge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` (see vercel.json). */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const report = await purgeExpiredTrash(admin() as unknown as PurgeClient);
    return Response.json(report);
  } catch (error) {
    console.error("purge-trash failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "Очистка корзины не выполнена" }, { status: 503 });
  }
}
