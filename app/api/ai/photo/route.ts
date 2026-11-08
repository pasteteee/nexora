import { access, failure, HttpError, reserveOperation } from "@/lib/knowledge/server";
import { PHOTO_HINTS, type PhotoHint } from "@/lib/photo/blocks";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, recognize, VisionError, visionKey, visionModel } from "@/lib/photo/recognize";

export const maxDuration = 90;

/**
 * A photo counts as one AI request. Until the migration that adds the `photo_import` type is applied,
 * the database rejects that type; the request is then logged as `explain`, so the limit still holds.
 */
async function reserve(workspaceId: string, userId: string) {
  try {
    return await reserveOperation(workspaceId, userId, "photo_import");
  } catch (e) {
    if (e instanceof HttpError && e.status === 503) return reserveOperation(workspaceId, userId, "explain");
    throw e;
  }
}

/**
 * Фото в тетрадь: распознаёт снимок (уже обрезанный и выпрямленный в браузере) и возвращает блоки
 * для страницы. Ничего не сохраняет: блоки вставляет клиент после предпросмотра.
 */
export async function POST(request: Request) {
  try {
    let form: FormData;
    try { form = await request.formData(); } catch { throw new HttpError(400, "Пришлите фото"); }
    const workspaceId = String(form.get("workspaceId") ?? "");
    const hintRaw = String(form.get("hint") ?? "auto");
    const hint: PhotoHint = PHOTO_HINTS.some(([h]) => h === hintRaw) ? (hintRaw as PhotoHint) : "auto";
    const image = form.get("image");
    if (!(image instanceof Blob) || !image.size) throw new HttpError(400, "Пришлите фото");
    if (!PHOTO_TYPES.includes(image.type)) throw new HttpError(415, "Подойдёт фото JPEG, PNG или WebP");
    if (image.size > PHOTO_MAX_BYTES) throw new HttpError(413, "Фото больше 4 МиБ. Обрежьте его или уменьшите");
    const { user } = await access(workspaceId, true);
    if (!visionKey()) throw new HttpError(503, "Распознавание фото не настроено: нужен ключ Gemini (EMBEDDINGS_API_KEY или GEMINI_API_KEY)");
    const { worker, logId } = await reserve(workspaceId, user.id);
    try {
      const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
      const blocks = await recognize({ mime: image.type, base64 }, hint, request.signal);
      await worker.from("ai_requests").update({ status: "completed", provider: `gemini:${visionModel()}` }).eq("id", logId);
      return Response.json({ blocks }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      await worker.from("ai_requests").update({ status: "error", error_message: e instanceof VisionError ? e.message.slice(0, 200) : "Photo recognition failed" }).eq("id", logId);
      if (e instanceof VisionError) throw new HttpError(502, e.message);
      if (request.signal.aborted) throw new HttpError(499, "Распознавание отменено");
      throw new HttpError(503, "Не удалось распознать фото. Попробуйте ещё раз");
    }
  } catch (error) {
    return failure(error);
  }
}
