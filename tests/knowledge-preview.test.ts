import { describe, expect, it, vi } from "vitest";
import {
  loadPreviewPage,
  previewPages,
  PREVIEW_PAGE_SIZE,
  type PreviewChunk,
} from "@/lib/knowledge/preview";
import type { SupabaseClient } from "@supabase/supabase-js";
const chunk = (
  position: number,
  content = "text",
  page_ref: string | null = "Страница 1",
): PreviewChunk => ({ id: `chunk-${position}`, position, content, page_ref });
function client(result: unknown) {
  const chain: { [key: string]: unknown } = {};
  for (const name of ["select", "eq", "gt", "order"])
    chain[name] = vi.fn(() => chain);
  chain.limit = vi.fn(async () => result);
  const from = vi.fn(() => chain);
  return {
    sb: { from } as unknown as Pick<SupabaseClient, "from">,
    from,
    chain,
  };
}
describe("private paginated source preview", () => {
  it("filters both workspace and source using caller's RLS client, with stable pagination", async () => {
    const rows = Array.from({ length: PREVIEW_PAGE_SIZE + 1 }, (_, i) =>
      chunk(i + 50),
    );
    const { sb, from, chain } = client({ data: rows });
    const result = await loadPreviewPage(sb, "workspace", "source", 49);
    expect(from).toHaveBeenCalledWith("source_chunks");
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "workspace");
    expect(chain.eq).toHaveBeenCalledWith("source_id", "source");
    expect(chain.gt).toHaveBeenCalledWith("position", 49);
    expect(chain.order).toHaveBeenCalledWith("position");
    expect(result.chunks).toHaveLength(50);
    expect(result.hasMore).toBe(true);
  });
  it("reports denied or failed reads without database diagnostics", async () => {
    const { sb } = client({ error: { message: "internal database secret" } });
    await expect(loadPreviewPage(sb, "w", "s")).rejects.toThrow(
      "Не удалось загрузить",
    );
  });
  it("restores overlapping text and preserves PDF/slide boundaries", () => {
    const text = "abcdefghij".repeat(180);
    const result = previewPages([
      chunk(0, text.slice(0, 1000)),
      chunk(1, text.slice(850)),
      chunk(2, "slide content", "Слайд 2"),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe(text);
    expect(result[1].ref).toBe("Слайд 2");
  });
  it("handles an empty or scanned source without inventing pages", () => {
    expect(previewPages([])).toEqual([]);
  });
});
