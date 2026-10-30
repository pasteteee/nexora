import type { SupabaseClient } from "@supabase/supabase-js";

export type PreviewChunk = {
  id: string;
  content: string;
  page_ref: string | null;
  position: number;
};
export const PREVIEW_PAGE_SIZE = 50;
/** Uses the caller's browser session and RLS; never a privileged key. */
export async function loadPreviewPage(
  sb: Pick<SupabaseClient, "from">,
  workspaceId: string,
  sourceId: string,
  afterPosition = -1,
) {
  const { data, error } = await sb
    .from("source_chunks")
    .select("id,content,page_ref,position")
    .eq("workspace_id", workspaceId)
    .eq("source_id", sourceId)
    .gt("position", afterPosition)
    .order("position")
    .limit(PREVIEW_PAGE_SIZE + 1);
  if (error)
    throw new Error(
      "Не удалось загрузить текст материала. Проверьте соединение и доступ.",
    );
  const rows = (data || []) as PreviewChunk[];
  return {
    chunks: rows.slice(0, PREVIEW_PAGE_SIZE),
    hasMore: rows.length > PREVIEW_PAGE_SIZE,
  };
}

/** Restore overlapping indexing fragments to readable pages without repeated lines. */
export function previewPages(chunks: PreviewChunk[]) {
  const pages: { ref: string | null; text: string; key: string }[] = [];
  for (const chunk of chunks) {
    const last = pages.at(-1);
    if (!last || last.ref !== chunk.page_ref) {
      pages.push({ ref: chunk.page_ref, text: chunk.content, key: chunk.id });
      continue;
    }
    let overlap = 0;
    for (
      let n = Math.min(150, last.text.length, chunk.content.length);
      n > 0;
      n--
    ) {
      if (last.text.endsWith(chunk.content.slice(0, n))) {
        overlap = n;
        break;
      }
    }
    last.text += overlap
      ? chunk.content.slice(overlap)
      : "\n\n" + chunk.content;
  }
  return pages;
}
