import { describe, expect, it } from "vitest";
import { isValidSlug, parsePublishedCanvas } from "../lib/publish/projection";
import { clampZoom } from "../components/public/PublicViewer";

const el = (over: Record<string, unknown>) => ({ id: crypto.randomUUID(), type: "text", x: 0, y: 0, width: 100, height: 40, rotation: 0, z_index: 0, group_id: null, content_json: {}, style_json: {}, ...over });

describe("public page projection", () => {
  it("accepts only capability-shaped slugs", () => {
    expect(isValidSlug("a".repeat(48))).toBe(true);
    expect(isValidSlug("short")).toBe(false);
    expect(isValidSlug("../../etc/passwd" + "a".repeat(32))).toBe(false);
    expect(isValidSlug("a".repeat(129))).toBe(false);
    expect(isValidSlug(undefined)).toBe(false);
  });

  it("returns null for an inactive or unknown publication", () => {
    expect(parsePublishedCanvas(null)).toBeNull();
    expect(parsePublishedCanvas("oops")).toBeNull();
  });

  it("orders blocks by documentOrder and falls back to geometry for legacy blocks", () => {
    const page = parsePublishedCanvas({ name: "Конспект", background_type: "dots", background_spacing: 32, elements: [
      el({ id: "b", content_json: { text: "второй", documentOrder: 1 } }),
      el({ id: "a", content_json: { text: "первый", documentOrder: 0 } }),
      el({ id: "legacy", y: -100, content_json: { text: "без порядка" } }),
    ] })!;
    expect(page.name).toBe("Конспект");
    expect(page.backgroundType).toBe("dots");
    expect(page.backgroundSpacing).toBe(32);
    expect(page.blocks.map((b) => b.id)).toEqual(["a", "b", "legacy"]);
  });

  it("never renders images, sources, fragments, connectors or groups", () => {
    const page = parsePublishedCanvas({ name: "x", elements: [
      el({ type: "image", content_json: { path: "ws/secret.png" } }),
      el({ type: "source", content_json: { name: "private.pdf" } }),
      el({ type: "source_fragment", content_json: { text: "цитата" } }),
      el({ type: "connector" }), el({ type: "group" }),
      el({ type: "formula", content_json: { latex: "x^2" } }),
    ] })!;
    expect(page.blocks).toHaveLength(1);
    expect(page.blocks[0]).toMatchObject({ kind: "formula", latex: "x^2" });
    expect(JSON.stringify(page)).not.toContain("secret");
  });

  it("reads both shape/kind and snake/camel style projections and drops unsafe values", () => {
    const page = parsePublishedCanvas({ name: "x", background_type: "evil", background_spacing: 7, elements: [
      el({ id: "s1", type: "shape", content_json: { shape: "ellipse", text: "старый" }, style_json: { font_size: 20, text_align: "center", fill: "green" } }),
      el({ id: "s2", type: "shape", content_json: { kind: "diamond", text: "новый" }, style_json: { fontSize: 999, align: "right", color: "red;background:url(x)" } }),
    ] })!;
    expect(page.backgroundType).toBe("plain");
    expect(page.backgroundSpacing).toBe(24);
    expect(page.blocks[0]).toMatchObject({ kind: "shape", shape: "ellipse", style: { fontSize: 20, align: "center", fill: "green" } });
    expect(page.blocks[1]).toMatchObject({ kind: "shape", shape: "diamond", style: { fontSize: 96, align: "right" } });
    expect(page.blocks[1].style.color).toBeUndefined();
  });

  it("clamps zoom to the supported range", () => {
    expect(clampZoom(10)).toBe(3);
    expect(clampZoom(0.01)).toBe(0.5);
    expect(clampZoom(1.234)).toBe(1.23);
  });
});
