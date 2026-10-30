import {
  access,
  failure,
  HttpError,
  reserveOperation,
} from "@/lib/knowledge/server";
import { search } from "@/lib/knowledge/search";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const q = params.get("q")?.trim();
    if (!q || q.length > 2000)
      throw new HttpError(400, "Введите запрос длиной до 2000 символов");
    const workspaceId = params.get("workspaceId") || "";
    const { user } = await access(workspaceId);
    const { worker, logId } = await reserveOperation(
      workspaceId,
      user.id,
      "search",
    );
    try {
      const results = await search(workspaceId, q, request.signal);
      await worker
        .from("ai_requests")
        .update({ status: "completed" })
        .eq("id", logId);
      return Response.json({ results });
    } catch (error) {
      await worker
        .from("ai_requests")
        .update({ status: "error", error_message: "Search failed" })
        .eq("id", logId);
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
