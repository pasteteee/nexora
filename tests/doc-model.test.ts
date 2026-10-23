import { describe, expect, it } from "vitest";
import {
  append, assignOrders, fromElement, insertAt, layoutOf, listNumber, readingOrder, relayout, toElement, without,
  type Block, type Item,
} from "@/lib/doc/model";

const blk = (id: string, order: number, extra: Partial<Block> = {}): Block => ({
  id, pageId: "p", kind: "p", text: id, checked: false, indent: 0, tint: null,
  order, row: null, col: 0, colW: 1, createdBy: null, ...extra,
});
const map = (...list: Block[]) => Object.fromEntries(list.map((b) => [b.id, b]));
/** применить изменения relayout и вернуть новую раскладку */
const apply = (blocks: Record<string, Block>, items: Item[]) => {
  const patches = relayout(blocks, items);
  const next = { ...blocks };
  for (const [id, p] of Object.entries(patches)) next[id] = { ...next[id], ...p };
  return { next, patches, layout: layoutOf(next) };
};

describe("модель документа", () => {
  it("элемент из БД и обратно сохраняет блок", () => {
    const b = blk("a", 2048, { kind: "todo", text: "<b>x</b>", checked: true, indent: 2, tint: "yellow", row: "r", col: 1, colW: 1.5 });
    expect(fromElement(toElement(b))).toEqual(b);
  });

  it("заметка со старого холста становится абзацем с экранированным текстом", () => {
    const b = fromElement({ ...toElement(blk("a", 5)), content: { text: "a < b" }, style: { fill: "x" } });
    expect(b).toMatchObject({ kind: "p", text: "a &lt; b", tint: null, row: null });
  });

  it("раскладка: верхний уровень по порядку, ряд — на месте первого блока", () => {
    const blocks = map(blk("a", 1), blk("b", 2, { row: "r", col: 0 }), blk("c", 3, { row: "r", col: 1 }), blk("d", 4, { row: "r", col: 0 }), blk("e", 5));
    const items = layoutOf(blocks);
    expect(items).toEqual([
      { type: "block", id: "a" },
      { type: "row", id: "r", cols: [{ w: 1, ids: ["b", "d"] }, { w: 1, ids: ["c"] }] },
      { type: "block", id: "e" },
    ]);
    expect(readingOrder(items)).toEqual(["a", "b", "d", "c", "e"]);
  });

  it("ряд из одной колонки распадается на обычные блоки", () => {
    expect(layoutOf(map(blk("a", 1, { row: "r" }), blk("b", 2, { row: "r" })))).toEqual([{ type: "block", id: "a" }, { type: "block", id: "b" }]);
  });

  it("перенос блока ниже меняет только его порядок", () => {
    const blocks = map(blk("a", 1024), blk("b", 2048), blk("c", 3072));
    const items = insertAt(without(layoutOf(blocks), ["a"]), ["a"], "c", "after")!;
    const { patches, layout } = apply(blocks, items);
    expect(Object.keys(patches)).toEqual(["a"]);
    expect(readingOrder(layout)).toEqual(["b", "c", "a"]);
  });

  it("бросок справа от блока создаёт две колонки", () => {
    const blocks = map(blk("a", 1), blk("b", 2), blk("c", 3));
    const items = insertAt(without(layoutOf(blocks), ["c"]), ["c"], "a", "right")!;
    const { layout } = apply(blocks, items);
    expect(layout[0]).toMatchObject({ type: "row", cols: [{ ids: ["a"] }, { ids: ["c"] }] });
    expect(layout[1]).toEqual({ type: "block", id: "b" });
  });

  it("вынос последнего блока из колонки убирает ряд", () => {
    const blocks = map(blk("a", 1, { row: "r", col: 0 }), blk("b", 2, { row: "r", col: 1 }), blk("c", 3));
    const items = append(without(layoutOf(blocks), ["b"]), ["b"]);
    const { next, layout } = apply(blocks, items);
    expect(layout).toEqual([{ type: "block", id: "a" }, { type: "block", id: "c" }, { type: "block", id: "b" }]);
    expect(next.a.row).toBeNull();
  });

  it("не больше четырёх колонок", () => {
    const blocks = map(...["a", "b", "c", "d"].map((id, i) => blk(id, i, { row: "r", col: i })), blk("e", 9));
    expect(insertAt(without(layoutOf(blocks), ["e"]), ["e"], "a", "left")).toBeNull();
    expect(insertAt(without(layoutOf(blocks), ["e"]), ["e"], "a", "after")).not.toBeNull();
  });

  it("порядок: сохраняет возрастающую часть и вставляет между соседями", () => {
    expect(assignOrders([10, 20, 30])).toEqual([10, 20, 30]);
    expect(assignOrders([10, 30, 20])).toEqual([10, 15, 20]);
    const same = assignOrders([0, 0, 0]);
    expect(same[1] - same[0]).toBeGreaterThan(0);
    expect(same[2] - same[1]).toBeGreaterThan(0);
    expect(same.filter((x) => x === 0)).toHaveLength(1);
    const out = assignOrders([5, 5.0000001, 5.0000001, 5.0000002]);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
  });

  it("нумерация списка считает подряд идущие пункты одного уровня", () => {
    const blocks = map(
      blk("a", 1, { kind: "numbered" }), blk("b", 2, { kind: "numbered", indent: 1 }), blk("c", 3, { kind: "numbered" }),
      blk("d", 4), blk("e", 5, { kind: "numbered" }),
    );
    const ids = ["a", "b", "c", "d", "e"];
    expect(["a", "b", "c", "e"].map((id) => listNumber(blocks, ids, id))).toEqual([1, 1, 2, 1]);
  });
});
