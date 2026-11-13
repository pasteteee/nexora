import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./setup-storage";
import { localData } from "@/lib/data/local";
import type { CanvasElement } from "@/lib/types";

const owner = "owner", editor = "editor", viewer = "viewer", outsider = "outsider";
const a = "workspace-a", b = "workspace-b", ca = "canvas-a", cb = "canvas-b";
const element = (id: string, canvasId = ca): CanvasElement => ({
  id, canvasId, type: "note", x: 0, y: 0, width: 100, height: 50,
  rotation: 0, zIndex: 1, content: { text: id }, style: {}, sourceId: null,
  groupId: null, createdBy: null, updatedAt: new Date().toISOString(),
});

function seed() {
  const date = new Date().toISOString();
  return {
    users: [owner, editor, viewer, outsider].map(id => ({ id, email: `${id}@example.test`, displayName: id, passHash: "fixture", confirmed: true })),
    tokens: {},
    workspaces: [a, b].map((id, i) => ({ id, ownerId: i ? outsider : owner, name: id, createdAt: date, updatedAt: date, deletedAt: null as string | null })),
    members: [{ workspaceId: a, userId: owner, role: "owner" }, { workspaceId: a, userId: editor, role: "editor" },
      { workspaceId: a, userId: viewer, role: "viewer" }, { workspaceId: b, userId: outsider, role: "owner" }],
    canvases: [ca, cb].map((id, i) => ({ id, workspaceId: i ? b : a, name: id, backgroundType: "grid", backgroundSpacing: 24,
      position: 1, deletedAt: null as string | null, createdAt: date, updatedAt: date })),
    elements: [element("own"), element("foreign", cb)], sources: [],
  };
}
function read(): ReturnType<typeof seed> { return JSON.parse(localStorage.getItem("nexora:db")!); }
function change(fn: (db: ReturnType<typeof seed>) => void) {
  const db = read(); fn(db); localStorage.setItem("nexora:db", JSON.stringify(db));
}

beforeEach(() => { localStorage.clear(); localStorage.setItem("nexora:db", JSON.stringify(seed())); localStorage.setItem("nexora:session", owner); });
afterEach(() => vi.useRealTimers());

describe("Trello #9/#13/#15/#18: изоляция и корзина", () => {
  it.each([owner, editor, viewer])("%s читает только своё пространство", async id => {
    localStorage.setItem("nexora:session", id);
    expect((await localData.listElements(ca)).map(e => e.id)).toEqual(["own"]);
    expect(await localData.getWorkspace(b)).toBeNull();
    await expect(localData.listElements(cb)).rejects.toMatchObject({ code: "not_found" });
  });
  it("наблюдатель не изменяет и не удаляет объекты", async () => {
    localStorage.setItem("nexora:session", viewer);
    const before = localStorage.getItem("nexora:db");
    await expect(localData.upsertElements([element("own")])).rejects.toMatchObject({ code: "forbidden" });
    await expect(localData.deleteElements(["own"])).rejects.toMatchObject({ code: "forbidden" });
    expect(localStorage.getItem("nexora:db")).toBe(before);
  });
  it("восстановление после 30 дней запрещено без предварительного открытия списка", async () => {
    change(db => { db.workspaces[0].deletedAt = new Date(Date.now() - 31 * 864e5).toISOString(); });
    await expect(localData.restoreWorkspace(a)).rejects.toMatchObject({ code: "not_found" });
    expect(await localData.getWorkspace(a)).toBeNull();
    expect(await localData.listTrash()).toHaveLength(0);
  });
  it("страница после 30 дней не восстанавливается", async () => {
    change(db => { db.canvases[0].deletedAt = new Date(Date.now() - 31 * 864e5).toISOString(); });
    await expect(localData.restoreCanvas(ca)).rejects.toMatchObject({ code: "not_found" });
  });
  it("элементы страницы в корзине недоступны по прямому запросу", async () => {
    await localData.trashCanvas(ca);
    await expect(localData.listElements(ca)).rejects.toMatchObject({ code: "not_found" });
    await localData.restoreCanvas(ca);
    expect(await localData.listElements(ca)).toHaveLength(1);
  });
  it("перестановка страниц не затрагивает другую тетрадь", async () => {
    const before = localStorage.getItem("nexora:db");
    await expect(localData.reorderCanvases(a, [ca, cb])).rejects.toMatchObject({ code: "not_found" });
    expect(localStorage.getItem("nexora:db")).toBe(before);
  });
  it("повторяющиеся id не меняют порядок частично", async () => {
    const before = localStorage.getItem("nexora:db");
    await expect(localData.reorderCanvases(a, [ca, ca])).rejects.toMatchObject({ code: "invalid" });
    expect(localStorage.getItem("nexora:db")).toBe(before);
  });
  it("существующий чужой id нельзя перенести в собственный холст", async () => {
    const before = localStorage.getItem("nexora:db");
    await expect(localData.upsertElements([element("foreign", ca)])).rejects.toMatchObject({ code: "not_found" });
    expect(localStorage.getItem("nexora:db")).toBe(before);
  });
  it("пакет с запрещённым удалением не удаляет разрешённую часть", async () => {
    const before = localStorage.getItem("nexora:db");
    await expect(localData.deleteElements(["own", "foreign"])).rejects.toMatchObject({ code: "not_found" });
    expect(localStorage.getItem("nexora:db")).toBe(before);
  });
});
