import { describe, expect, it, vi } from "vitest";
import { chunks, assertFile, assertSourcePath } from "@/lib/knowledge/text";
import { boundedContext } from "@/lib/knowledge/context";
import { zipSync, strToU8 } from "fflate";
vi.mock("server-only", () => ({}));
import { extract } from "@/lib/knowledge/extract";

describe("knowledge extraction and citations", () => {
  it("rejects storage traversal before privileged download", () => {
    const prefix = "workspace/source/";
    for (const name of [
      "../../victim/source/file",
      "..",
      ".",
      "%2e%2e%2fsecret",
      "folder/file",
      "folder\\file",
      "file?token=x",
      "file#fragment",
      "",
    ]) {
      expect(() =>
        assertSourcePath(prefix + name, "workspace", "source"),
      ).toThrow();
    }
    expect(() =>
      assertSourcePath("victim/source/file.pdf", "workspace", "source"),
    ).toThrow();
    expect(() =>
      assertSourcePath(prefix + "lecture-2026.pdf", "workspace", "source"),
    ).not.toThrow();
  });
  it("splits normalized text with overlap without crossing page references", () => {
    const text = "x".repeat(1800);
    const rows = chunks([
      { text, ref: "Страница 1" },
      { text: "second", ref: "Страница 2" },
    ]);
    expect(rows.map((r) => r.content.length)).toEqual([1000, 950, 6]);
    expect(rows.map((r) => r.page_ref)).toEqual([
      "Страница 1",
      "Страница 1",
      "Страница 2",
    ]);
    expect(chunks([{ text: "  one\r\n two  ", ref: null }])[0].content).toBe(
      "one\n two",
    );
  });
  it("rejects spoofed types, incorrect size and oversized files", () => {
    const bytes = strToU8("hello");
    expect(() => assertFile(bytes, "application/pdf", 5, 25)).toThrow();
    expect(() => assertFile(bytes, "text/plain", 6, 25)).toThrow();
    expect(() => assertFile(bytes, "text/plain", 5, 4)).toThrow();
    expect(() => assertFile(strToU8("ab\0cd"), "text/plain", 5, 25)).toThrow();
    expect(() => assertFile(bytes, "text/plain", 5, 25)).not.toThrow();
  });
  it("extracts PPTX text in numeric slide order with real slide numbers", async () => {
    const zip = zipSync({
      "ppt/slides/slide10.xml": strToU8("<p:sld><a:t>Ten</a:t></p:sld>"),
      "ppt/slides/slide2.xml": strToU8(
        "<p:sld><a:t>Two</a:t><a:t>More</a:t></p:sld>",
      ),
      "ppt/notesSlides/notesSlide1.xml": strToU8("<a:t>Private notes</a:t>"),
    });
    const rows = await extract(
      zip,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(rows).toEqual([
      { text: "Two\nMore", ref: "Слайд 2" },
      { text: "Ten", ref: "Слайд 10" },
    ]);
  });
  it("extracts UTF-8 text without inventing page references", async () => {
    expect(
      await extract(strToU8("# Привет\nKnowledge"), "text/markdown"),
    ).toEqual([{ text: "# Привет\nKnowledge", ref: null }]);
  });
  it("reads an actual PDF text layer with a page reference", async () => {
    const parts = ["%PDF-1.4\n"];
    const offsets = [0];
    const stream = "BT /F1 12 Tf 50 100 Td (Hello knowledge from PDF) Tj ET";
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    objects.forEach((o, i) => {
      offsets.push(parts.join("").length);
      parts.push(`${i + 1} 0 obj\n${o}\nendobj\n`);
    });
    const start = parts.join("").length;
    parts.push(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
        .join(
          "",
        )}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`,
    );
    const pages = await extract(strToU8(parts.join("")), "application/pdf");
    expect(pages[0].ref).toBe("Страница 1");
    expect(pages[0].text).toContain("Hello knowledge from PDF");
  });
});

describe("bounded AI context", () => {
  const el = (id: string, x: number, text = "body") => ({
    id,
    x,
    y: 0,
    content_json: { text },
  });
  it("only includes three nearest in radius and truncates large selected text", () => {
    const result = boundedContext(
      [el("selected", 0, "z".repeat(5000))],
      [
        el("selected", 0),
        el("outside", 501),
        el("b", 100),
        el("a", 100),
        el("c", 250),
        el("d", 300),
      ],
    );
    expect(result.nearby.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(result.selected[0].text.length).toBe(3000);
  });
  it("does not send unselected canvas content for workspace questions", () => {
    expect(boundedContext([], [el("secret", 0)]).nearby).toEqual([]);
  });
});
