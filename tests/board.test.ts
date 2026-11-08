import { describe, expect, it } from "vitest";
import { compileFn, insertMathKey, toTex } from "@/lib/editor/board/math";
import { COLS, linesToMarkdown, markdownToLines, pack, pageWidgets, summary, widgetType, defaultData } from "@/lib/editor/board/model";
import type { CanvasElement } from "@/lib/types";

const el = (id: string, type: CanvasElement["type"], content: Record<string, unknown> = {}, y = 0): CanvasElement => ({
  id, canvasId: "c", type, x: 0, y, width: 100, height: 40, rotation: 0, zIndex: 1, content, style: {},
  sourceId: null, groupId: null, createdBy: null, updatedAt: "",
});

describe("формулы без LaTeX", () => {
  it("дроби, степени, корни и пределы", () => {
    expect(toTex("(x+1)/2")).toBe("\\frac{x + 1}{2}");
    expect(toTex("x^2")).toBe("x^{2}");
    expect(toTex("sqrt(x)")).toBe("\\sqrt{x}");
    expect(toTex("lim(x->0) sin(x)/x")).toContain("\\frac{\\sin");
    expect(toTex("корень(2)")).toBe("\\sqrt{2}");
  });
  it("LaTeX проходит без изменений", () => { expect(toTex("\\frac{a}{b}")).toBe("\\frac{a}{b}"); });
  it("кнопка оборачивает выделение", () => {
    expect(insertMathKey("x+1", 0, 3, ["√", "Корень", "sqrt()", 5])).toEqual({ value: "sqrt(x+1)", caret: 9 });
  });
});

describe("график", () => {
  it("читает запись как в калькуляторе", () => {
    expect(compileFn("x^2")!(3)).toBe(9);
    expect(compileFn("2x - 1")!(2)).toBe(3);
    expect(compileFn("y = sin(x)")!(0)).toBe(0);
    expect(compileFn("|x|")!(-2)).toBe(2);
    expect(compileFn("-x^2")!(2)).toBe(-4);
  });
  it("не исполняет произвольный код", () => {
    expect(compileFn("alert(1)")).toBeNull();
    expect(compileFn("constructor")).toBeNull();
    expect(compileFn("x +")).toBeNull();
  });
});

describe("строки текста", () => {
  it("Markdown туда и обратно", () => {
    const md = "# Заголовок\n- пункт\n1. первый\n- [x] сделано\n> цитата\nабзац";
    const lines = markdownToLines(md);
    expect(lines.map((l) => l.t)).toEqual(["h1", "li", "ol", "todo", "quote", "p"]);
    expect(linesToMarkdown(lines)).toBe(md);
  });
});

describe("виджеты страницы", () => {
  it("типы элементов", () => {
    expect(widgetType(el("a", "text"))).toBe("text");
    expect(widgetType(el("b", "note"))).toBe("note");
    expect(widgetType(el("c", "note", { widget: "kanban" }))).toBe("kanban");
    expect(widgetType(el("d", "source_fragment"))).toBe("fragment");
    expect(widgetType(el("e", "connector"))).toBeNull();
  });
  it("старые блоки без раскладки идут ниже в прежнем порядке", () => {
    const ws = pageWidgets({
      a: el("a", "text", { layout: { col: 0, span: 12, key: 5 } }),
      b: el("b", "text", { documentOrder: 1 }),
      c: el("c", "text", { documentOrder: 0 }),
    });
    expect(ws.map((w) => w.id)).toEqual(["a", "c", "b"]);
    expect(ws[1].layout.span).toBe(COLS);
  });
  it("укладка с гравитацией: соседние колонки встают рядом", () => {
    const placed = pack([
      { id: "a", col: 0, span: 12, key: 0, h: 100 },
      { id: "b", col: 12, span: 12, key: 1, h: 50 },
      { id: "c", col: 12, span: 12, key: 2, h: 30 },
      { id: "d", col: 0, span: 24, key: 3, h: 10 },
    ], 16);
    const top = Object.fromEntries(placed.map((p) => [p.id, p.top]));
    expect(top).toEqual({ a: 0, b: 0, c: 66, d: 116 });
  });
  it("у каждого виджета есть текст для поиска и публикации", () => {
    expect(summary("kanban", defaultData("kanban"))).toContain("Надо");
    expect(summary("checklist", { title: "ДЗ", items: [{ id: "1", text: "задача", done: true }] })).toContain("- [x] задача");
  });
});
