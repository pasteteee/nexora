import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { extract } from "@/lib/knowledge/extract";
import { chunks } from "@/lib/knowledge/text";

const bytes = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

describe("acceptance documents from the Trello test plan", () => {
  it("extracts all 12 PDF pages and preserves their citations", async () => {
    const pages = await extract(bytes("lecture-12-pages.pdf"), "application/pdf");
    expect(pages).toHaveLength(12);
    pages.forEach((page, index) => {
      expect(page.ref).toBe(`Страница ${index + 1}`);
      expect(page.text).toContain(`NEXORA-PAGE-${String(index + 1).padStart(2, "0")}`);
    });
    expect(chunks(pages).every(chunk => chunk.page_ref?.startsWith("Страница "))).toBe(true);
  });
  it("extracts all 12 PPTX slides in numeric order", async () => {
    const pages = await extract(bytes("lecture-12-slides.pptx"), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(pages).toHaveLength(12);
    pages.forEach((page, index) => {
      expect(page.ref).toBe(`Слайд ${index + 1}`);
      expect(page.text).toContain(`NEXORA-SLIDE-${String(index + 1).padStart(2, "0")}`);
    });
  });
  it("keeps an image-only PDF without inventing a text layer", async () => {
    const pages = await extract(bytes("scan-no-text.pdf"), "application/pdf");
    expect(pages).toHaveLength(1);
    expect(chunks(pages)).toEqual([]);
  });
});
