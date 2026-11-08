import { describe, expect, it } from "vitest";
import { AREA_TOO_LARGE, checkExportArea, exportFileName } from "../lib/export/area";
import { buildPageExport, PAGE_EXPORT_FORMAT } from "../lib/export/json";
import { A4, imagesToPdf, pageSliceHeight } from "../lib/export/pdf";
import type { Canvas, CanvasElement } from "../lib/types";

const page: Canvas = { id: "p1", workspaceId: "w1", name: "Конспект: лекция 1/2", backgroundType: "grid", backgroundSpacing: 24, position: 0, deletedAt: null, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-02T00:00:00Z" };
const el = (id: string, over: Partial<CanvasElement> = {}): CanvasElement => ({ id, canvasId: "p1", type: "text", x: 0, y: 0, width: 100, height: 40, rotation: 0, zIndex: 0, content: { text: id }, style: {}, sourceId: null, groupId: null, createdBy: null, updatedAt: "2026-11-02T00:00:00Z", ...over });

describe("export area limit", () => {
  it("blocks areas larger than 10 000 × 10 000 world units", () => {
    expect(checkExportArea(800, 10_000)).toBeNull();
    expect(checkExportArea(800, 10_001)).toBe(AREA_TOO_LARGE);
    expect(checkExportArea(10_001, 10)).toBe("Выберите меньшую область");
    expect(checkExportArea(0, 10)).not.toBeNull();
  });
  it("builds safe file names", () => {
    expect(exportFileName("Конспект: лекция 1/2", "png", new Date("2026-11-08T10:00:00Z"))).toBe("Konspekt lektsiya 1 2 2026-11-08.png");
    expect(exportFileName("Ёлка Über", "pdf", new Date("2026-11-08T10:00:00Z"))).toBe("Elka Uber 2026-11-08.pdf");
    expect(exportFileName("  ", "json", new Date("2026-11-08T10:00:00Z"))).toBe("Nexora page 2026-11-08.json");
  });
});

describe("JSON export", () => {
  it("exports the page structure in document order without touching the source", () => {
    const els = { b: el("b", { content: { text: "b", documentOrder: 1 } }), a: el("a", { content: { text: "a", documentOrder: 0 } }), g: el("g", { type: "group" }) };
    const before = JSON.stringify(els);
    const out = buildPageExport(page, els, new Date("2026-11-08T10:00:00Z"));
    expect(out.format).toBe(PAGE_EXPORT_FORMAT);
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe("2026-11-08T10:00:00.000Z");
    expect(out.page).toMatchObject({ id: "p1", name: page.name, backgroundType: "grid" });
    expect(out.elements.map((e) => e.id)).toEqual(["a", "b", "g"]);
    out.elements[0].content.text = "changed";
    expect(JSON.stringify(els)).toBe(before);
    expect(JSON.parse(JSON.stringify(out)).elements).toHaveLength(3);
  });
});

describe("PDF writer", () => {
  it("produces a structurally valid multi-page PDF with a correct xref table", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = imagesToPdf([{ jpeg, width: 1600, height: 2263 }, { jpeg, width: 1600, height: 500 }], "Лекция (1)");
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Count 2");
    expect(text.match(/\/Type \/Page /g)).toHaveLength(2);
    // Each xref offset must point at "N 0 obj".
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const offsets = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(9);
    offsets.forEach((off, i) => expect(text.slice(off, off + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });
  it("slices tall snapshots into A4 proportions", () => {
    expect(pageSliceHeight(1600)).toBe(Math.floor(1600 * A4.height / A4.width));
    expect(() => imagesToPdf([])).toThrow();
  });
});
