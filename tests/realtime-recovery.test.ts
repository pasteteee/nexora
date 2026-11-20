import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => { throw new Error("not used in tests"); } }));
vi.mock("@/lib/data/supabase-data", () => ({ toEl: (row: unknown) => row }));
const { createSupabaseTransport, rejoinDelay, REJOIN_DELAYS_MS } = await import("@/lib/realtime/supabase");
import type { ConnectionStatus, PresenceInfo } from "@/lib/realtime/types";

type Cb = (status: string) => void;
class FakeChannel {
  cb: Cb | null = null;
  tracked: unknown[] = [];
  removed = false;
  handlers: Record<string, () => void> = {};
  constructor(public name: string) {}
  on(type: string, filter: { event: string }, fn: () => void) { this.handlers[`${type}:${filter.event}`] = fn; return this; }
  subscribe(cb: Cb) { this.cb = cb; return this; }
  track(p: unknown) { this.tracked.push(p); return Promise.resolve("ok"); }
  send() { return Promise.resolve("ok"); }
  presenceState() { return {}; }
}

function fakeClient() {
  const created: FakeChannel[] = [];
  let auth = 0;
  const client = {
    realtime: { setAuth: async () => { auth += 1; } },
    channel: (name: string) => { const c = new FakeChannel(name); created.push(c); return c; },
    removeChannel: (c: FakeChannel) => { c.removed = true; },
  };
  return { client, created, auth: () => auth, latest: (name: string) => created.filter((c) => c.name === name).at(-1)! };
}

const me: PresenceInfo = { key: "k1", userId: "u1", name: "Аня", color: "#000" };
const flush = () => new Promise((r) => setTimeout(r, 0));

function open(delay = () => 0) {
  const f = fakeClient();
  const statuses: ConnectionStatus[] = [];
  const transport = createSupabaseTransport(() => f.client as never, delay);
  const conn = transport.open({ pageId: "p1", workspaceId: "w1", me }, {
    onOps: () => {}, onStatus: (s) => statuses.push(s), onPresence: () => {}, onCursor: () => {}, onRole: () => {},
  });
  return { ...f, statuses, conn };
}

describe("Supabase Realtime: восстановление первого подключения (критерий 23)", () => {
  it("live только когда подключены и изменения, и присутствие", async () => {
    const t = open();
    await flush();
    t.latest("page:p1").cb!("SUBSCRIBED");
    expect(t.statuses.at(-1)).toBe("connecting");
    t.latest("page:p1:live").cb!("SUBSCRIBED");
    expect(t.statuses.at(-1)).toBe("live");
    expect(t.latest("page:p1:live").tracked).toHaveLength(1);
  });

  it("после отказа канала присутствия пересоздаёт его со свежим JWT и снова объявляет участника", async () => {
    const t = open();
    await flush();
    t.latest("page:p1").cb!("SUBSCRIBED");
    const first = t.latest("page:p1:live");
    const authBefore = t.auth();
    first.cb!("CHANNEL_ERROR");
    expect(first.removed).toBe(true);
    expect(t.statuses.at(-1)).toBe("offline");
    await flush(); await flush();
    const second = t.latest("page:p1:live");
    expect(second).not.toBe(first);
    expect(t.auth()).toBeGreaterThan(authBefore);
    second.cb!("SUBSCRIBED");
    expect(t.statuses.at(-1)).toBe("live");
    expect(second.tracked).toHaveLength(1);
    // поздний ответ старого канала ничего не ломает
    first.cb!("CLOSED");
    expect(t.statuses.at(-1)).toBe("live");
  });

  it("отказ по таймауту тоже восстанавливается; паузы растут и ограничены", async () => {
    const t = open();
    await flush();
    t.latest("page:p1").cb!("TIMED_OUT");
    await flush(); await flush();
    expect(t.created.filter((c) => c.name === "page:p1")).toHaveLength(2);
    expect(rejoinDelay(0)).toBe(250);
    expect(rejoinDelay(1)).toBeGreaterThan(rejoinDelay(0));
    expect(rejoinDelay(100)).toBe(REJOIN_DELAYS_MS.at(-1));
    expect(REJOIN_DELAYS_MS[0] + REJOIN_DELAYS_MS[1]).toBeLessThan(2000);
  });

  it("после закрытия не переподключается и снимает все каналы", async () => {
    vi.useFakeTimers();
    try {
      const t = open(() => 1000);
      await vi.advanceTimersByTimeAsync(0);
      t.latest("page:p1:live").cb!("CHANNEL_ERROR");
      t.conn.close();
      const count = t.created.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(t.created.length).toBe(count);
      expect(t.created.every((c) => c.removed)).toBe(true);
      expect(t.statuses.at(-1)).toBe("idle");
    } finally { vi.useRealTimers(); }
  });
});
