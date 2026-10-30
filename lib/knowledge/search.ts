import "server-only";
import { limits } from "@/lib/config";
import { access } from "./server";
import { embed } from "./provider";
export async function search(
  workspaceId: string,
  query: string,
  signal?: AbortSignal,
) {
  const { sb } = await access(workspaceId);
  const [vector] = await embed([query], signal);
  const { data, error } = await sb.rpc("match_source_chunks", {
    p_workspace_id: workspaceId,
    p_embedding: JSON.stringify(vector),
    p_limit: 5,
  });
  if (error) throw error;
  const matches = (data || []).filter(
    (r: { similarity: number }) => r.similarity >= limits.searchMinSimilarity,
  );
  const ids = [
    ...new Set(matches.map((r: { source_id: string }) => r.source_id)),
  ];
  const { data: sources } = ids.length
    ? await sb
        .from("sources")
        .select("id,original_name")
        .eq("workspace_id", workspaceId)
        .in("id", ids)
    : { data: [] };
  return matches.map((r: { source_id: string }) => ({
    ...r,
    sourceName:
      sources?.find((s) => s.id === r.source_id)?.original_name || "Материал",
  }));
}
