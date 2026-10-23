import { beforeEach, describe, expect, it, vi } from "vitest";
import "./setup-storage";
import type { CanvasElement } from "@/lib/types";
import { alignPatches, distributePatches, makeGroup, orphanGroups, ungroup, zOrder } from "@/lib/editor/arrange";
import { edgePoint, endpoints, rectOf, translate } from "@/lib/editor/connector";
import { makeElement } from "@/lib/editor/factory";
import { fillOf, strokeOf, textCss } from "@/lib/editor/styles";
import { checkUpload, sourceMime } from "@/lib/data/upload-rules";

vi.mock("@/lib/data", () => ({ data: { upsertElements: async () => {}, deleteElements: async () => {} } }));
const { useEditor } = await import("@/lib/editor/store");

const el = (id: string, x = 0, y = 0, extra: Partial<CanvasElement> = {}): CanvasElement => ({
  id, canvasId: "c", type: "note", x, y, width: 100, height: 50, rotation: 0, zIndex: 0,
  content: {}, style: {}, sourceId: null, groupId: null, createdBy: null, updatedAt: "", ...extra,
});
const map = (...xs: CanvasElement[]) => Object.fromEntries(xs.map((e) => [e.id, e]));

describe("типы объектов (ТЗ 4.2.5)", () => {
  it("создаются с центром в точке и стилем по умолчанию", () => {
    const n = makeElement("note", { x: 0, y: 0 }, "c", 3);
    expect(n).toMatchObject({ x: -100, y: -80, zIndex: 3, style: { color: "yellow" } });
    expect(makeElement("shape", { x: 0, y: 0 }, "c", 1).content.kind).toBe("rect");
    expect(makeElement("formula", { x: 0, y: 0 }, "c", 1).content.latex).toBeTruthy();
  });
  it("форматирование текста: размер, начертание, выравнивание", () => {
    expect(textCss({ fontSize: 24, bold: true, italic: true, underline: true, strike: true, align: "center" })).toMatchObject({
      fontSize: 24, fontWeight: 650, fontStyle: "italic", textDecoration: "underline line-through", textAlign: "center", whiteSpace: "pre-wrap",
    });
  });
  it("палитры из токенов темы", () => {
    expect(fillOf("pink")).toBe("var(--note-pink)");
    expect(fillOf("none")).toBe("transparent");
    expect(fillOf("var(--note-blue)")).toBe("var(--note-blue)");
    expect(strokeOf("unknown")).toBe("var(--ink)");
  });
});

describe("соединитель", () => {
  const a = el("a", 0, 0), b = el("b", 300, 0);
  it("привязанные концы лежат на границах объектов", () => {
    const c = el("l", 0, 0, { type: "connector", content: { fromId: "a", toId: "b" } });
    expect(endpoints(c, map(a, b, c))).toEqual({ a: { x: 100, y: 25 }, b: { x: 300, y: 25 } });
  });
  it("свободная линия хранит координаты концов", () => {
    const c = el("l", 0, 0, { type: "connector", content: { from: { x: 10, y: 10 }, to: { x: 60, y: 90 } } });
    expect(rectOf(c, map(c))).toEqual({ x: 10, y: 10, width: 50, height: 80 });
    expect((translate(c, 5, 5).content as { to: unknown }).to).toEqual({ x: 65, y: 95 });
  });
  it("удаление объекта отключает линию", () => {
    const c = el("l", 0, 0, { type: "connector", content: { fromId: "a", toId: "x" } });
    expect(endpoints(c, map(a, c))).toBeNull();
  });
  it("точка на границе по лучу из центра", () => {
    expect(edgePoint({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 500 })).toEqual({ x: 50, y: 100 });
  });
});

describe("порядок, выравнивание, группы", () => {
  const els = map(el("a", 0, 0, { zIndex: 1 }), el("b", 50, 40, { zIndex: 2 }), el("c", 200, 10, { zIndex: 3 }));
  it("на передний и задний план", () => {
    expect(zOrder(els, ["a"], "front")).toEqual({ b: { zIndex: 1 }, c: { zIndex: 2 }, a: { zIndex: 3 } });
    expect(zOrder(els, ["c"], "back")).toEqual({ c: { zIndex: 1 }, a: { zIndex: 2 }, b: { zIndex: 3 } });
    expect(zOrder(els, ["a"], "forward")).toEqual({ b: { zIndex: 1 }, a: { zIndex: 2 } });
  });
  it("выравнивание по краям и центру", () => {
    expect(alignPatches(Object.values(els), "left")).toEqual({ b: { x: 0, y: 40 }, c: { x: 0, y: 10 } });
    expect(alignPatches(Object.values(els), "top")).toEqual({ b: { x: 50, y: 0 }, c: { x: 200, y: 0 } });
  });
  it("распределение с равными промежутками", () => {
    const p = distributePatches([el("a", 0), el("b", 120), el("c", 400)], "x");
    expect(p).toEqual({ b: { x: 200 } });
  });
  it("группа — объект group, участники ссылаются на него", () => {
    const g = makeGroup(Object.values(els), "c")!;
    expect(g.group).toMatchObject({ type: "group", x: 0, y: 0, width: 300, height: 90, zIndex: 1 });
    expect(Object.values(g.patch).every((p) => p.groupId === g.group.id)).toBe(true);
    expect(makeGroup([el("a")], "c")).toBeNull();
    const withG = { ...els, [g.group.id]: g.group };
    for (const [id, p] of Object.entries(g.patch)) withG[id] = { ...withG[id], ...p };
    expect(ungroup(withG, [g.group.id])).toEqual({ patch: { a: { groupId: null }, b: { groupId: null }, c: { groupId: null } }, remove: [g.group.id] });
    expect(orphanGroups(map(el("a", 0, 0, { groupId: "g" })), ["g"])).toEqual(["g"]);
  });
  it("группировка — один шаг истории", () => {
    useEditor.getState().init({ canvasId: "c", canEdit: true, els: Object.values(els), background: { type: "grid", spacing: 24 } });
    const g = makeGroup(Object.values(els), "c")!;
    expect(useEditor.getState().batch({ add: [g.group], patch: g.patch })).toBe(true);
    expect(useEditor.getState().els.a.groupId).toBe(g.group.id);
    useEditor.getState().undo();
    expect(useEditor.getState().els.a.groupId).toBeNull();
    expect(useEditor.getState().els[g.group.id]).toBeUndefined();
  });
});

describe("загрузка источников (ТЗ 4.2.6)", () => {
  beforeEach(() => {});
  it("MIME для .md и проверка форматов", () => {
    expect(sourceMime({ name: "a.md", type: "" })).toBe("text/markdown");
    expect(sourceMime({ name: "a.PDF", type: "" })).toBe("application/pdf");
    expect(() => checkUpload({ name: "a.exe", type: "", size: 1 }, [])).toThrow(/Формат/);
    expect(() => checkUpload({ name: "a.pdf", type: "application/pdf", size: 26 * 1024 * 1024 }, [])).toThrow(/25/);
    expect(() => checkUpload({ name: "a.pdf", type: "application/pdf", size: 1 }, Array(100).fill({ size: 1 }))).toThrow(/100/);
  });
});
