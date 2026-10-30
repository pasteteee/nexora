import { after } from "next/server";
import {
  access,
  admin,
  failure,
  HttpError,
  uuid,
  reserveOperation,
} from "@/lib/knowledge/server";
import { processSource } from "@/lib/knowledge/process";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  try {
    const { sourceId } = await params;
    if (!uuid(sourceId)) throw new HttpError(400, "Неверный материал");
    const sb = await (await import("@/lib/supabase/server")).supabaseServer();
    const { data: source } = await sb
      .from("sources")
      .select("workspace_id,status,updated_at")
      .eq("id", sourceId)
      .single();
    if (!source) throw new HttpError(404, "Материал не найден");
    const { user } = await access(source.workspace_id, true);
    if (source.status === "ready") return Response.json({ status: "ready" });
    if (
      source.status === "processing" &&
      Date.parse(source.updated_at) > Date.now() - 310000
    )
      return Response.json({ status: "processing" }, { status: 202 });
    const { worker: logger, logId } = await reserveOperation(
      source.workspace_id,
      user.id,
      "source_processing",
    );
    const worker = admin();
    const { data, error } = await worker
      .from("sources")
      .update({ status: "processing", error_message: null })
      .eq("id", sourceId)
      .neq("status", "ready")
      .or(
        `status.neq.processing,updated_at.lt.${new Date(Date.now() - 310000).toISOString()}`,
      )
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (data)
      after(async () => {
        await processSource(sourceId, user.id);
        const { data: result } = await logger
          .from("sources")
          .select("status")
          .eq("id", sourceId)
          .maybeSingle();
        await logger
          .from("ai_requests")
          .update({
            status: result?.status === "error" ? "error" : "completed",
          })
          .eq("id", logId);
      });
    else
      await logger
        .from("ai_requests")
        .update({ status: "completed" })
        .eq("id", logId);
    return Response.json({ status: "processing" }, { status: 202 });
  } catch (error) {
    return failure(error);
  }
}
