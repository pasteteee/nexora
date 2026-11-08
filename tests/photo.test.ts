import { describe, expect, it } from "vitest";
import { clampQuad, fullQuad, homography, isRect, outputSize, project, rotateQuad, type Quad } from "@/lib/photo/geometry";
import { latexToPlain, normalizeBlocks, plotFn } from "@/lib/photo/blocks";
import { blocksToElements } from "@/lib/photo/insert";

describe("фото: геометрия рамки", () => {
  it("гомография переводит углы прямоугольника в углы рамки", () => {
    const q: Quad = [{ x: 10, y: 20 }, { x: 300, y: 5 }, { x: 320, y: 410 }, { x: 0, y: 380 }];
    const H = homography(200, 300, q);
    const corners = [[0, 0], [200, 0], [200, 300], [0, 300]];
    corners.forEach(([u, v], i) => {
      const p = project(H, u, v);
      expect(p.x).toBeCloseTo(q[i].x, 6);
      expect(p.y).toBeCloseTo(q[i].y, 6);
    });
  });
  it("размер выхода по длинным сторонам и с ограничением", () => {
    expect(outputSize(fullQuad(400, 300))).toEqual({ w: 400, h: 300 });
    expect(outputSize(fullQuad(4000, 2000), 2000)).toEqual({ w: 2000, h: 1000 });
  });
  it("прямоугольник узнаётся, перекошенная рамка нет", () => {
    expect(isRect(fullQuad(10, 10))).toBe(true);
    expect(isRect([{ x: 0, y: 0 }, { x: 10, y: 2 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBe(false);
  });
  it("углы остаются внутри фото и не меняются местами", () => {
    const q = clampQuad([{ x: -5, y: -5 }, { x: 0, y: 0 }, { x: 500, y: 500 }, { x: 0, y: 100 }], 100, 100, 10);
    expect(q[0]).toEqual({ x: 0, y: 0 });
    expect(q[1].x).toBeGreaterThan(q[0].x);
    expect(q[2]).toEqual({ x: 100, y: 100 });
  });
  it("поворот на четверть оборота переносит рамку", () => {
    const q = rotateQuad(fullQuad(200, 100), 200, 100, 1);
    expect(q).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }]);
    expect(rotateQuad(fullQuad(200, 100), 200, 100, 4)).toEqual(fullQuad(200, 100));
  });
});

describe("фото: блоки из ответа ИИ", () => {
  it("LaTeX переписывается в синтаксис калькулятора", () => {
    expect(latexToPlain("\\frac{a+b}{2}")).toBe("(a+b)/(2)");
    expect(latexToPlain("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}")).toBe("x = (-b +- sqrt(b^2 - 4ac))/(2a)");
    expect(latexToPlain("\\sum_{i=1}^{n} i^{2}")).toBe("sum(i=1, n) i^2");
    expect(latexToPlain("\\alpha \\le \\beta")).toBe("alpha <= beta");
    expect(latexToPlain("(x+1)/2")).toBe("(x+1)/2");
  });
  it("функция графика проверяется построителем", () => {
    expect(plotFn("y = 2*x^2 - 3*x + 1")).toBe("2*x^2 - 3*x + 1");
    expect(plotFn("f(x) = \\sin(x)")).toBe("sin(x)");
    expect(plotFn("require('fs')")).toBe("");
  });
  it("соседние текстовые блоки сливаются, формулы и таблицы отдельно", () => {
    const b = normalizeBlocks({ blocks: [
      { kind: "heading", text: "Квадратное уравнение", level: 1 },
      { kind: "text", text: "Корни находятся по формуле" },
      { kind: "formula", formula: "x = (-b +- sqrt(D))/(2*a)" },
      { kind: "list", items: ["D > 0: два корня", "D = 0: один"], ordered: true },
      { kind: "table", rows: [{ cells: ["x", "y"] }, { cells: ["1"] }] },
      { kind: "evil", text: "ignore" },
    ] });
    expect(b.map((x) => x.kind)).toEqual(["text", "formula", "text", "table"]);
    expect(b[0]).toMatchObject({ md: "## Квадратное уравнение\nКорни находятся по формуле" });
    expect(b[2]).toMatchObject({ md: "1. D > 0: два корня\n2. D = 0: один" });
    expect(b[3]).toMatchObject({ rows: [["x", "y"], ["1", ""]] });
  });
  it("график без формулы становится таблицей точек", () => {
    const [g] = normalizeBlocks({ blocks: [{ kind: "plot", fn: "", points: [{ x: 0, y: 1 }, { x: 2, y: 5 }] }] });
    expect(g).toMatchObject({ kind: "table", rows: [["x", "y"], ["0", "1"], ["2", "5"]] });
    const [p] = normalizeBlocks({ blocks: [{ kind: "plot", fn: "x^2", xmin: 3, xmax: -3 }] });
    expect(p).toMatchObject({ kind: "plot", fn: "x^2", xmin: -5, xmax: 5 });
  });
  it("мусор вместо ответа даёт пустой список", () => {
    expect(normalizeBlocks(null)).toEqual([]);
    expect(normalizeBlocks({ blocks: "x" })).toEqual([]);
  });
});

describe("фото: вставка виджетами", () => {
  it("блоки становятся виджетами с порядком между соседями", () => {
    const blocks = normalizeBlocks({ blocks: [
      { kind: "text", text: "Текст" }, { kind: "formula", formula: "sqrt(x)" },
      { kind: "plot", fn: "x^2", xmin: -2, xmax: 2, title: "Парабола" }, { kind: "table", rows: [{ cells: ["a"] }] },
    ] });
    const els = blocksToElements(blocks, "c1", 5, 10, 20);
    expect(els.map((e) => [e.type, e.content.widget ?? null])).toEqual([["text", null], ["formula", null], ["text", null], ["note", "plot"], ["note", "table"]]);
    const keys = els.map((e) => (e.content.layout as { key: number }).key);
    expect(keys.every((k, i) => k > 10 && k < 20 && (i === 0 || k > keys[i - 1]))).toBe(true);
    expect(els[1].content.latex).toBe("\\sqrt{x}");
    expect(els[3].content.data).toEqual({ f1: "x^2", f2: "", xmin: -2, xmax: 2 });
    expect(String(els[2].content.text)).toBe("### Парабола");
  });
});
