import { noStore, pgFailure, respond, RouteError, userClient, UUID } from "@/lib/collab/server";
import { publicPath, type Publication } from "@/lib/collab/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ canvasId: string }> };

async function canvasId(ctx: Ctx) {
  const { canvasId } = await ctx.params;
  if (!UUID.test(canvasId)) throw new RouteError(400, "Неверная страница");
  return canvasId;
}

/** Создать или обновить публикацию (Приложение 3): владелец или редактор */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const id = await canvasId(ctx);
    const { sb } = await userClient(request);
    const { data, error } = await sb.rpc("publish_canvas", { p_canvas_id: id });
    if (error) pgFailure(error);
    const row = (data as { slug: string; is_active: boolean; published_at: string }[])[0];
    if (!row) throw new RouteError(503, "Сервис временно недоступен");
    const publication: Publication = {
      canvasId: id, slug: row.slug, isActive: row.is_active, publishedAt: row.published_at, path: publicPath(row.slug),
    };
    return Response.json({ publication }, { headers: noStore });
  } catch (error) {
    return respond(error);
  }
}

/** Отключить публикацию: ссылка сразу перестаёт отдавать содержимое */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const id = await canvasId(ctx);
    const { sb } = await userClient(request);
    const { error } = await sb.rpc("unpublish_canvas", { p_canvas_id: id });
    if (error) pgFailure(error);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return respond(error);
  }
}
