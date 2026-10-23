import { beforeEach, describe, expect, it } from "vitest";
import { readingOrder, type Block } from "@/lib/doc/model";
import { useDoc } from "@/lib/doc/store";

const blk = (id: string, order: number, extra: Partial<Block> = {}): Block => ({
  id, pageId: "p", kind: "p", text: id, checked: false, indent: 0, tint: null,
  order, row: null, col: 0, colW: 1, createdBy: null, ...extra,
});
const st = () => useDoc.getState();
const order = () => readingOrder(st().items);

beforeEach(() => {
  st().init({ pageId: "p", canEdit: true, persist: false, blocks: [blk("a", 1024), blk("b", 2048), blk("c", 3072)] });
});

describe("стор документа", () => {
  it("ввод в один блок склеивается в один шаг истории", () => {
    st().setText("a", "a1"); st().setText("a", "a12"); st().setText("a", "a123");
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().blocks.a.text).toBe("a");
    st().redo();
    expect(st().blocks.a.text).toBe("a123");
  });

  it("разрезание и склейка блока", () => {
    const id = st().split("a", "he", "ad", "p");
    expect(order()).toEqual(["a", id, "b", "c"]);
    expect([st().blocks.a.text, st().blocks[id].text]).toEqual(["he", "ad"]);
    st().mergeUp(id);
    expect(order()).toEqual(["a", "b", "c"]);
    expect(st().blocks.a.text).toBe("head");
  });

  it("перетаскивание: выше, в колонку и отмена", () => {
    st().move(["c"], "a", "before");
    expect(order()).toEqual(["c", "a", "b"]);
    st().move(["b"], "c", "right");
    expect(st().items[0]).toMatchObject({ type: "row", cols: [{ ids: ["c"] }, { ids: ["b"] }] });
    st().undo();
    expect(order()).toEqual(["c", "a", "b"]);
    expect(st().items.every((i) => i.type === "block")).toBe(true);
    st().undo();
    expect(order()).toEqual(["a", "b", "c"]);
  });

  it("сдвиг клавишами выходит из колонки над рядом", () => {
    st().move(["b"], "a", "right");
    st().moveBy("b", -1);
    expect(st().items.map((i) => (i.type === "block" ? i.id : "row"))).toEqual(["b", "a", "c"]);
  });

  it("удаление переводит фокус на соседа, дублирование ставит копию ниже", () => {
    st().remove(["b"], true);
    expect(order()).toEqual(["a", "c"]);
    expect(st().focus?.id).toBe("a");
    st().duplicate(["a"]);
    const o = order();
    expect(o).toHaveLength(3);
    expect(st().blocks[o[1]].text).toBe("a");
  });

  it("читатель не может менять документ", () => {
    st().init({ pageId: "p", canEdit: false, persist: false, blocks: [blk("a", 1)] });
    st().setText("a", "x");
    st().remove(["a"]);
    expect(st().blocks.a.text).toBe("a");
  });
});
