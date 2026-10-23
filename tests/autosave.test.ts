import { afterEach, describe, expect, it, vi } from "vitest";

const calls: { up: string[]; del: string[] }[] = [];
let failNext = false;
vi.mock("@/lib/data", () => ({
  data: {
    async upsertElements(els: { id: string }[]) {
      if (failNext) { failNext = false; throw new Error("offline"); }
      if (els.length) calls.push({ up: els.map((e) => e.id), del: [] });
    },
    async deleteElements(ids: string[]) { if (ids.length) calls.push({ up: [], del: ids }); },
  },
}));

const { bindAutosave, flush, markChanged, markRemoved, resetAutosave, useSaveStatus } = await import("@/lib/editor/autosave");
const el = (id: string) => ({ id }) as never;
bindAutosave(el);

afterEach(() => { calls.length = 0; resetAutosave(); vi.useRealTimers(); });

describe("автосохранение", () => {
  it("частые изменения уходят одной пачкой не раньше 200 мс", async () => {
    vi.useFakeTimers();
    markChanged(["a"]); markChanged(["b"]); markChanged(["a"]);
    expect(useSaveStatus.getState().status).toBe("pending");
    await vi.advanceTimersByTimeAsync(150);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60);
    expect(calls[0].up.sort()).toEqual(["a", "b"]);
    expect(useSaveStatus.getState().status).toBe("saved");
  });
  it("текст сохраняется через 1 с после последнего ввода", async () => {
    vi.useFakeTimers();
    markChanged(["t"], "text");
    await vi.advanceTimersByTimeAsync(800);
    markChanged(["t"], "text");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toHaveLength(1);
  });
  it("удаление отменяет несохранённое изменение", async () => {
    markChanged(["x"]); markRemoved(["x"]);
    await flush();
    expect(calls).toEqual([{ up: [], del: ["x"] }]);
  });
  it("ошибка показывается, изменения не теряются и уходят при повторе", async () => {
    failNext = true;
    markChanged(["e"]);
    await flush();
    expect(useSaveStatus.getState().status).toBe("error");
    await flush();
    expect(calls[0].up).toEqual(["e"]);
    expect(useSaveStatus.getState().status).toBe("saved");
  });
});
