import "server-only";
import { limits } from "@/lib/config";
import { admin } from "./server";
import { extract } from "./extract";
import { assertFile, assertSourcePath, chunks } from "./text";
import { embed } from "./provider";

export async function processSource(sourceId: string, userId: string) {
  const sb = admin();
  const { data: source } = await sb
    .from("sources")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (!source) return;
  const requestId = crypto.randomUUID();
  try {
    const { data: member } = await sb
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", source.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    const { data: workspace } = await sb
      .from("workspaces")
      .select("deleted_at")
      .eq("id", source.workspace_id)
      .single();
    if (
      !member ||
      member.role === "viewer" ||
      !workspace ||
      workspace.deleted_at
    )
      throw new Error("Доступ отозван");
    assertSourcePath(source.file_path, source.workspace_id, sourceId);
    const { data: file, error } = await sb.storage
      .from("nexora-sources")
      .download(source.file_path);
    if (error || !file) throw new Error("Файл недоступен");
    const bytes = new Uint8Array(await file.arrayBuffer());
    assertFile(bytes, source.mime_type, source.size, limits.maxUploadBytes);
    const pages = await extract(bytes, source.mime_type);
    if (
      source.mime_type === "application/pdf" &&
      pages.every((p) => p.text.trim().length < 20)
    ) {
      const result = await sb
        .from("sources")
        .update({
          status: "requires_ocr",
          error_message: "Требуется OCR: PDF без текстового слоя",
        })
        .eq("id", sourceId);
      if (result.error) throw result.error;
      return;
    }
    const fragments = chunks(pages);
    if (fragments.length > 2000)
      throw new Error("Слишком большой объём текста");
    const rows = [];
    for (let i = 0; i < fragments.length; i += 32) {
      const batch = fragments.slice(i, i + 32);
      const vectors = await embed(batch.map((c) => c.content));
      rows.push(
        ...batch.map((c, j) => ({
          ...c,
          position: i + j,
          embedding: vectors[j],
        })),
      );
    }
    const result = await sb.rpc("replace_source_index", {
      p_source_id: sourceId,
      p_chunks: rows,
    });
    if (result.error) throw result.error;
  } catch {
    await sb
      .from("sources")
      .update({
        status: "error",
        error_message:
          "Обработка не завершена. Проверьте настройки сервиса и повторите.",
      })
      .eq("id", sourceId);
    await sb.from("ai_requests").insert({
      workspace_id: source.workspace_id,
      user_id: userId,
      request_id: requestId,
      request_type: "embedding",
      status: "error",
      error_message: "Source processing failed",
    });
  }
}
