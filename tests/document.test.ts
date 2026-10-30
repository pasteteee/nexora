import { describe, expect, it } from "vitest";
import { documentBlocks, mergeText, moveBlock, orderPatches, splitText } from "../lib/editor/document";
import { makeElement } from "../lib/editor/factory";

const block = (id: string, y: number, content: Record<string, unknown> = {}) => makeElement("text", { x: 0, y }, "page", 0, { id, y, content });
const ids = (list: ReturnType<typeof documentBlocks>) => list.map((b) => b.id);
describe("flow document ordering", () => {
  it("reads legacy coordinates deterministically without changing content or geometry", () => {
    const a = block("a", 300, { text: "Earlier canvas text" }), b = block("b", -20);
    expect(ids(documentBlocks({ a, b }))).toEqual(["b", "a"]);
    expect(a.y).toBe(300); expect(a.content.text).toBe("Earlier canvas text");
  });
  it("persists reorder while new AI insertions append, retaining metadata", () => {
    const a = block("a", -20, { text: "A", source: "kept" }), b = block("b", 400);
    const moved = moveBlock([a, b], "b", 0), patches = orderPatches(moved);
    const reordered = { a: { ...a, ...patches.a }, b: { ...b, ...patches.b }, ai: block("ai", -100) };
    expect(ids(documentBlocks(reordered))).toEqual(["b", "a", "ai"]);
    expect(reordered.a.content).toMatchObject({ text: "A", source: "kept", documentOrder: 1 });
    expect(reordered.a.y).toBe(-20);
  });
  it("handles malformed ordering and moves at document boundaries", () => {
    const a = block("a", 0, { documentOrder: Number.NaN }), b = block("b", 1);
    expect(ids(documentBlocks({ b, a }))).toEqual(["a", "b"]);
    expect(ids(moveBlock([a, b], "b", -4))).toEqual(["b", "a"]);
    expect(ids(moveBlock([a, b], "a", 90))).toEqual(["b", "a"]);
  });
});
describe("document text boundaries", () => {
  it("splits at caret, replaces selection, and preserves multiline Markdown", () => {
    expect(splitText("# Hello\nworld", 7)).toEqual(["# Hello", "\nworld"]);
    expect(splitText("abcdef", 2, 4)).toEqual(["ab", "ef"]);
    expect(splitText("abc", 99)).toEqual(["abc", ""]);
    expect(splitText("abc", -1)).toEqual(["", "abc"]);
  });
  it("merges paragraphs and restores the caret at their previous boundary", () => {
    expect(mergeText("**First**", " second")).toEqual({ text: "**First** second", caret: 9 });
    expect(mergeText("", "hello")).toEqual({ text: "hello", caret: 0 });
  });
});
