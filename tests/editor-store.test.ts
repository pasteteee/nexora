import { beforeEach, describe, expect, it, vi } from "vitest";
import "./setup-storage";

vi.mock("@/lib/data", () => ({ data: { upsertElements: async () => {}, deleteElements: async () => {} } }));
const { useEditor, HISTORY_LIMIT } = await import("@/lib/editor/store");
const { cloneElements } = await import("@/lib/editor/clone");
import type { CanvasElement } from "@/lib/types";

const el = (id: string, x = 0, extra: Partial<CanvasElement> = {}): CanvasElement => ({
  id, canvasId: "c", type: "note", x, y: 0, width: 100, height: 50, rotation: 0, zIndex: 0,
  content: {}, style: {}, sourceId: null, groupId: null, createdBy: null, updatedAt: "", ...extra,
});

beforeEach(() => {
  useEditor.getState().init({ canvasId: "c", canEdit: true, els: [el("a"), el("b", 200)], background: { type: "grid", spacing: 24 } });
});

describe("история действий", () => {
  it("перемещение отменяется и повторяется", () => {
    const st = useEditor.getState();
    st.apply({ a: { x: 50 } });
    expect(useEditor.getState().els.a.x).toBe(50);
    useEditor.getState().undo();
    expect(useEditor.getState().els.a.x).toBe(0);
    useEditor.getState().redo();
    expect(useEditor.getState().els.a.x).toBe(50);
  });
  it("отмена удаления возвращает объект, отмена создания — убирает", () => {
    useEditor.getState().remove(["a"]);
    expect(useEditor.getState().els.a).toBeUndefined();
    useEditor.getState().undo();
    expect(useEditor.getState().els.a).toBeDefined();
    useEditor.getState().add([el("n", 500)]);
    useEditor.getState().undo();
    expect(useEditor.getState().els.n).toBeUndefined();
  });
  it("глубина истории не меньше 50", () => {
    for (let i = 1; i <= 60; i++) useEditor.getState().apply({ a: { x: i } });
    expect(useEditor.getState().past.length).toBe(60);
    for (let i = 0; i < 55; i++) useEditor.getState().undo();
    expect(useEditor.getState().els.a.x).toBe(5);
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(50);
  });
  it("новое действие очищает повтор", () => {
    useEditor.getState().apply({ a: { x: 10 } });
    useEditor.getState().undo();
    useEditor.getState().apply({ b: { x: 10 } });
    expect(useEditor.getState().future).toHaveLength(0);
  });
  it("за границей ±500 000 изменение отклоняется", () => {
    expect(useEditor.getState().apply({ a: { x: 600000 } })).toBe(false);
    expect(useEditor.getState().els.a.x).toBe(0);
  });
});

describe("копирование", () => {
  it("копии получают новые id, связи и группы переводятся на копии", () => {
    const src = [
      el("g", 0, { type: "group" }),
      el("a", 0, { groupId: "g" }),
      el("b", 0, { groupId: "g" }),
      el("l", 0, { type: "connector", content: { fromId: "a", toId: "outside" } }),
    ];
    const out = cloneElements(src, 24, 24, 10);
    const byOld = (i: number) => out[src.findIndex((s) => s.id === src[i].id)];
    expect(out.every((e) => !["g", "a", "b", "l"].includes(e.id))).toBe(true);
    const g = out.find((e) => e.type === "group")!;
    expect(out.filter((e) => e.type === "note").every((e) => e.groupId === g.id)).toBe(true);
    const link = out.find((e) => e.type === "connector")!;
    expect(out.some((e) => e.id === link.content.fromId)).toBe(true);
    expect(link.content.toId).toBeNull();
    expect(byOld(1).x).toBe(24);
  });
});
