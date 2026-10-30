import { beforeEach, describe, expect, it, vi } from "vitest";
import "./setup-storage";
import { consumeToken, localAuth, localData } from "@/lib/data/local";

async function user(email: string) {
  await localAuth.signUp(email, "secret123", email.split("@")[0]);
  const link = localAuth.demoInbox(email)!;
  await consumeToken(new URL(link.url, "http://x").searchParams.get("confirm")!, "confirm");
}

beforeEach(() => localStorage.clear());

describe("авторизация (демо)", () => {
  it("вход доступен до подтверждения, подтверждение одноразовое", async () => {
    await localAuth.signUp("a@b.ru", "secret123", "Аня");
    await localAuth.signIn("a@b.ru", "secret123");
    expect((await localAuth.current())?.emailVerified).toBe(false);
    await expect(localData.createWorkspace()).resolves.toMatchObject({ role: "owner" });
    const t = new URL(localAuth.demoInbox("a@b.ru")!.url, "http://x").searchParams.get("confirm")!;
    await consumeToken(t, "confirm");
    expect((await localAuth.current())?.emailVerified).toBe(true);
    await expect(consumeToken(t, "confirm")).rejects.toThrow(/устарела/); // ссылка одноразовая
    await localAuth.signOut();
    await localAuth.signIn("A@B.ru", "secret123");
    expect((await localAuth.current())?.displayName).toBe("Аня");
  });
  it("неверный пароль — общая ошибка", async () => {
    await user("a@b.ru");
    await expect(localAuth.signIn("a@b.ru", "wrong1234")).rejects.toThrow("Неверный e-mail или пароль");
  });
});

describe("тетради и страницы", () => {
  it("новая тетрадь сразу с первой страницей", async () => {
    await user("a@b.ru");
    const ws = await localData.createWorkspace();
    expect(ws.name).toBe("Новая тетрадь");
    expect(ws.pageCount).toBe(1);
    expect(ws.role).toBe("owner");
  });
  it("чужая тетрадь выглядит как несуществующая", async () => {
    await user("owner@b.ru");
    const ws = await localData.createWorkspace("Секрет");
    await localAuth.signOut();
    await user("other@b.ru");
    expect(await localData.getWorkspace(ws.id)).toBeNull();
    await expect(localData.listCanvases(ws.id)).rejects.toMatchObject({ code: "not_found" });
  });
  it("корзина: восстановление и очистка через 30 дней", async () => {
    await user("a@b.ru");
    const ws = await localData.createWorkspace("Курс");
    await localData.trashWorkspace(ws.id);
    expect(await localData.listWorkspaces()).toHaveLength(0);
    expect(await localData.listTrash()).toHaveLength(1);
    await localData.restoreWorkspace(ws.id);
    expect(await localData.listWorkspaces()).toHaveLength(1);

    await localData.trashWorkspace(ws.id);
    vi.useFakeTimers({ now: Date.now() + 31 * 864e5, toFake: ["Date"] });
    await localData.listWorkspaces();
    expect(await localData.listTrash()).toHaveLength(0);
    vi.useRealTimers();
  });
  it("дублирование страницы переназначает связи и группы", async () => {
    await user("a@b.ru");
    const ws = await localData.createWorkspace();
    const [page] = await localData.listCanvases(ws.id);
    const base = { canvasId: page.id, x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 0, style: {}, sourceId: null, createdBy: null, updatedAt: "" };
    await localData.upsertElements([
      { ...base, id: "n1", type: "note", content: {}, groupId: "g1" },
      { ...base, id: "n2", type: "note", content: {}, groupId: "g1" },
      { ...base, id: "c1", type: "connector", content: { fromId: "n1", toId: "n2" }, groupId: null },
    ]);
    const copy = await localData.duplicateCanvas(page.id);
    const els = await localData.listElements(copy.id);
    const conn = els.find((e) => e.type === "connector")!;
    const ids = new Set(els.map((e) => e.id));
    expect(ids.has("n1")).toBe(false);
    expect(ids.has(conn.content.fromId as string)).toBe(true);
    expect(new Set(els.filter((e) => e.type === "note").map((e) => e.groupId)).size).toBe(1);
    expect(els.find((e) => e.type === "note")!.groupId).not.toBe("g1");
  });
  it("порядок страниц сохраняется", async () => {
    await user("a@b.ru");
    const ws = await localData.createWorkspace();
    await localData.createCanvas(ws.id);
    await localData.createCanvas(ws.id);
    const ids = (await localData.listCanvases(ws.id)).map((c) => c.id).reverse();
    await localData.reorderCanvases(ws.id, ids);
    expect((await localData.listCanvases(ws.id)).map((c) => c.id)).toEqual(ids);
  });
});
