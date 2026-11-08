import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./setup-storage";

const saved: { up: unknown[]; del: string[] } = { up: [], del: [] };
vi.mock("@/lib/data", () => ({
  data: {
    upsertElements: async (els: unknown[]) => { saved.up.push(...els); },
    deleteElements: async (ids: string[]) => { saved.del.push(...ids); },
  },
}));
const { useEditor } = await import("@/lib/editor/store");
const autosave = await import("@/lib/editor/autosave");
const { PageSync } = await import("@/lib/realtime/engine");
const { stamp, sameContent } = await import("@/lib/realtime/lww");
const { startPageRealtime, useRealtime, moveCursor, throttle, CURSOR_THROTTLE_MS } = await import("@/lib/realtime/session");
const { broadcastTransport, announceRoleChange, PEER_TTL_MS } = await import("@/lib/realtime/broadcast");
import type { CanvasElement } from "@/lib/types";
import type { ConnectionHandlers, PresenceInfo, RealtimeTransport, RemoteOp } from "@/lib/realtime/types";

const el = (id: string, updatedAt: string, extra: Partial<CanvasElement> = {}): CanvasElement => ({
  id, canvasId: "p1", type: "note", x: 0, y: 0, width: 100, height: 50, rotation: 0, zIndex: 0,
  content: { text: id }, style: {}, sourceId: null, groupId: null, createdBy: null, updatedAt, ...extra,
});
const T = (s: number, micro = 0) => `2026-11-08T20:00:${String(s).padStart(2, "0")}.${String(micro).padStart(6, "0")}+00:00`;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const me = (key: string, userId = key): PresenceInfo => ({ key, userId, name: `User ${key}`, color: "#000" });

describe("LWW: серверные метки времени", () => {
  it("различает микросекунды внутри одной миллисекунды", () => {
    expect(stamp("2026-11-08T20:00:00.123456+00:00")).toBeGreaterThan(stamp("2026-11-08T20:00:00.123455+00:00"));
  });
  it("одинаково читает форматы REST, jsonb и ISO", () => {
    expect(stamp("2026-11-08 20:00:00.5+00")).toBe(stamp("2026-11-08T20:00:00.500Z"));
    expect(stamp("2026-11-08T23:00:00+03:00")).toBe(stamp("2026-11-08T20:00:00Z"));
    expect(stamp("")).toBe(-Infinity);
  });
  it("сравнение содержимого не зависит от порядка ключей и метки", () => {
    expect(sameContent(el("a", T(1), { content: { a: 1, b: 2 } }), el("a", T(2), { content: { b: 2, a: 1 } }))).toBe(true);
    expect(sameContent(el("a", T(1)), el("a", T(1), { x: 5 }))).toBe(false);
  });
});

function harness(initial: CanvasElement[], server: CanvasElement[] = []) {
  const els: Record<string, CanvasElement> = Object.fromEntries(initial.map((e) => [e.id, e]));
  const pending = new Set<string>();
  const applied: { upsert: CanvasElement[]; remove: string[] }[] = [];
  const db = { rows: server };
  let loadGate: (() => void) | null = null;
  const sync = new PageSync({
    elements: () => els,
    apply: (p) => { applied.push(p); p.upsert.forEach((e) => (els[e.id] = e)); p.remove.forEach((id) => delete els[id]); },
    isPending: (id) => pending.has(id),
    pendingIds: () => pending,
    load: async () => { if (loadGate) await new Promise<void>((r) => (loadGate = r)); return db.rows; },
  });
  return { sync, els, pending, applied, db, gate() { loadGate = () => {}; }, release() { loadGate?.(); } };
}

describe("PageSync: применение удалённых операций", () => {
  it("применяет более новую версию и игнорирует устаревшую (порядок доставки не важен)", () => {
    const h = harness([el("a", T(1))]);
    h.sync.receive([{ kind: "upsert", element: el("a", T(3), { x: 30 }) }]);
    h.sync.receive([{ kind: "upsert", element: el("a", T(2), { x: 20 }) }]);
    expect(h.els.a.x).toBe(30);
  });
  it("последняя подтверждённая запись побеждает при конфликте одного свойства", () => {
    const h = harness([el("a", T(1))]);
    h.sync.receive([
      { kind: "upsert", element: el("a", T(5, 2), { x: 2 }) },
      { kind: "upsert", element: el("a", T(5, 1), { x: 1 }) },
    ]);
    expect(h.els.a.x).toBe(2);
  });
  it("не перезаписывает объект с несохранённой локальной правкой", () => {
    const h = harness([el("a", T(1), { x: 99 })]);
    h.pending.add("a");
    h.sync.receive([{ kind: "upsert", element: el("a", T(4), { x: 1 }) }]);
    expect(h.els.a.x).toBe(99);
  });
  it("не трогает стор, если пришло эхо собственного сохранения", () => {
    const h = harness([el("a", T(1), { x: 7 })]);
    h.sync.receive([{ kind: "upsert", element: el("a", T(2), { x: 7 }) }]);
    expect(h.applied).toHaveLength(0);
  });
  it("удаление убирает объект, старый upsert после удаления не воскрешает его", () => {
    const h = harness([el("a", T(1))]);
    h.sync.receive([{ kind: "delete", id: "a", at: T(3) }]);
    expect(h.els.a).toBeUndefined();
    h.sync.receive([{ kind: "upsert", element: el("a", T(2)) }]);
    expect(h.els.a).toBeUndefined();
    // отмена удаления — новая запись с более поздней меткой
    h.sync.receive([{ kind: "upsert", element: el("a", T(4)) }]);
    expect(h.els.a).toBeDefined();
  });
  it("запоздавшее удаление не убирает более новую версию", () => {
    const h = harness([]);
    h.sync.receive([{ kind: "upsert", element: el("a", T(5)) }]);
    h.sync.receive([{ kind: "delete", id: "a", at: T(4) }]);
    expect(h.els.a).toBeDefined();
  });
  it("добавляет новые объекты других участников", () => {
    const h = harness([]);
    h.sync.receive([{ kind: "upsert", element: el("b", T(1)) }]);
    expect(Object.keys(h.els)).toEqual(["b"]);
  });
});

describe("PageSync: дозагрузка из БД при переподключении", () => {
  it("приводит страницу к состоянию БД, сохраняя локальные правки", async () => {
    const h = harness(
      [el("stale", T(1)), el("gone", T(1)), el("mine", T(1), { x: 5 }), el("new-local", T(0))],
      [el("stale", T(3), { x: 33 }), el("mine", T(3), { x: 1 }), el("added", T(2))],
    );
    h.pending.add("mine"); h.pending.add("new-local");
    await h.sync.resync();
    expect(h.els.stale.x).toBe(33);
    expect(h.els.gone).toBeUndefined();
    expect(h.els.added).toBeDefined();
    expect(h.els.mine.x).toBe(5);
    expect(h.els["new-local"]).toBeDefined();
  });
  it("не откатывает изменение, пришедшее во время загрузки", async () => {
    const h = harness([el("a", T(1))], [el("a", T(1))]);
    h.gate();
    const run = h.sync.resync();
    await tick();
    h.sync.receive([{ kind: "upsert", element: el("a", T(5), { x: 50 }) }, { kind: "upsert", element: el("b", T(5)) }]);
    h.release();
    await run;
    expect(h.els.a.x).toBe(50);
    expect(h.els.b).toBeDefined();
  });
  it("повторные вызовы во время загрузки объединяются и выполняют ещё один проход", async () => {
    const h = harness([], [el("a", T(1))]);
    let loads = 0;
    const orig = h.db;
    const sync = new PageSync({
      elements: () => h.els, apply: (p) => p.upsert.forEach((e) => (h.els[e.id] = e)),
      isPending: () => false, pendingIds: () => [], load: async () => { loads++; await tick(); return orig.rows; },
    });
    await Promise.all([sync.resync(), sync.resync(), sync.resync()]);
    expect(loads).toBe(2);
  });
});

/** Транспорт-заглушка: тест сам вызывает обработчики, как это сделал бы сервер */
function fakeTransport() {
  const t = { handlers: null as ConnectionHandlers | null, published: [] as RemoteOp[], cursors: [] as unknown[], closed: false };
  const transport: RealtimeTransport = {
    open(_p, h) {
      t.handlers = h;
      return { publishOps: (ops) => t.published.push(...ops), sendCursor: (c) => t.cursors.push(c), close: () => { t.closed = true; } };
    },
  };
  return { t, transport };
}

describe("Realtime-сессия страницы и стор редактора", () => {
  let stop: (() => void) | undefined;
  const server: CanvasElement[] = [];
  const workspace = { role: "editor" as string | null };
  const sessionData = {
    listElements: vi.fn(async () => server),
    getWorkspace: vi.fn(async () => (workspace.role ? { role: workspace.role } as never : null)),
  };
  beforeEach(() => {
    autosave.resetAutosave();
    saved.up.length = 0; saved.del.length = 0;
    server.length = 0; workspace.role = "editor";
    sessionData.listElements.mockClear(); sessionData.getWorkspace.mockClear();
    useEditor.getState().init({ canvasId: "p1", canEdit: true, els: [el("a", T(1))], background: { type: "grid", spacing: 24 } });
  });
  afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); });

  it("удалённые изменения попадают в стор без истории отмены", () => {
    const { t, transport } = fakeTransport();
    stop = startPageRealtime({ pageId: "p1", workspaceId: "w1", me: me("k1"), transport, data: sessionData });
    t.handlers!.onOps([{ kind: "upsert", element: el("a", T(2), { x: 40 }) }, { kind: "upsert", element: el("b", T(2)) }]);
    expect(useEditor.getState().els.a.x).toBe(40);
    expect(useEditor.getState().els.b).toBeDefined();
    expect(useEditor.getState().past).toHaveLength(0);
    expect(autosave.hasUnsaved()).toBe(false);
  });

  it("операции другой страницы не применяются", () => {
    const { t, transport } = fakeTransport();
    stop = startPageRealtime({ pageId: "p2", workspaceId: "w1", me: me("k1"), transport, data: sessionData });
    t.handlers!.onOps([{ kind: "upsert", element: el("x", T(2), { canvasId: "p2" }) }]);
    expect(useEditor.getState().els.x).toBeUndefined();
  });

  it("при подключении и переподключении дозагружает страницу и роль из БД", async () => {
    const { t, transport } = fakeTransport();
    server.push(el("a", T(1)), el("c", T(2)));
    stop = startPageRealtime({ pageId: "p1", workspaceId: "w1", me: me("k1"), transport, data: sessionData });
    t.handlers!.onStatus("live");
    await tick();
    expect(useEditor.getState().els.c).toBeDefined();
    t.handlers!.onStatus("offline");
    server.splice(1, 1);
    t.handlers!.onStatus("live");
    await tick();
    expect(sessionData.listElements).toHaveBeenCalledTimes(2);
    expect(useEditor.getState().els.c).toBeUndefined();
    expect(useRealtime.getState().status).toBe("live");
  });

  it("смена роли применяется сразу: наблюдатель не редактирует, исключённый теряет доступ", () => {
    const { t, transport } = fakeTransport();
    stop = startPageRealtime({ pageId: "p1", workspaceId: "w1", me: me("k1"), transport, data: sessionData });
    t.handlers!.onRole({ workspaceId: "w1", role: "viewer" });
    expect(useEditor.getState().canEdit).toBe(false);
    expect(useRealtime.getState().role).toBe("viewer");
    t.handlers!.onRole({ workspaceId: "w1", role: "editor" });
    expect(useEditor.getState().canEdit).toBe(true);
    t.handlers!.onRole({ workspaceId: "w1", role: null });
    expect(useEditor.getState().canEdit).toBe(false);
    expect(useRealtime.getState().accessLost).toBe(true);
  });

  it("пропущенную смену роли подхватывает проверка при переподключении", async () => {
    const { t, transport } = fakeTransport();
    workspace.role = "viewer";
    stop = startPageRealtime({ pageId: "p1", workspaceId: "w1", me: me("k1"), transport, data: sessionData });
    t.handlers!.onStatus("live");
    await tick();
    expect(useEditor.getState().canEdit).toBe(false);
  });

  it("подтверждённые сохранения публикуются (демо-режим), несохранённые — нет", async () => {
    const { t, transport } = fakeTransport();
    stop = startPageRealtime({ pageId: "p1", workspaceId: "w1", me: me("k1"), transport, data: sessionData });
    useEditor.getState().apply({ a: { x: 12 } });
    expect(t.published).toHaveLength(0);
    await autosave.flush();
    expect(t.published).toEqual([expect.objectContaining({ kind: "upsert", element: expect.objectContaining({ id: "a", x: 12 }) })]);
    useEditor.getState().remove(["a"]);
    await autosave.flush();
    expect(t.published.at(-1)).toEqual(expect.objectContaining({ kind: "delete", id: "a" }));
  });

  it("удалённая версия не затирает правку, которая ещё сохраняется", async () => {
    const { t, transport } = fakeTransport();
    stop = startPageRealtime({ pageId: "p1", workspaceId: "w1", me: me("k1"), transport, data: sessionData });
    useEditor.getState().apply({ a: { x: 77 } });
    t.handlers!.onOps([{ kind: "upsert", element: el("a", T(9), { x: 1 }) }]);
    expect(useEditor.getState().els.a.x).toBe(77);
    await autosave.flush();
  });

  it("presence: себя не дублирует, курсоры ушедших участников удаляются", () => {
    const { t, transport } = fakeTransport();
    stop = startPageRealtime({ pageId: "p1", workspaceId: "w1", me: me("k1"), transport, data: sessionData });
    t.handlers!.onPresence([me("k2"), me("k3")]);
    expect(useRealtime.getState().presence.map((p) => p.key)).toEqual(["k1", "k2", "k3"]);
    t.handlers!.onCursor({ key: "k2", cursor: { x: 1, y: 2 } });
    t.handlers!.onCursor({ key: "k3", cursor: { x: 3, y: 4 } });
    t.handlers!.onPresence([me("k1"), me("k3")]);
    expect(useRealtime.getState().cursors).toEqual({ k3: { x: 3, y: 4 } });
  });

  it("курсор отправляется не чаще раза в 50 мс, последнее положение не теряется", () => {
    vi.useFakeTimers();
    const { t, transport } = fakeTransport();
    stop = startPageRealtime({ pageId: "p1", workspaceId: "w1", me: me("k1"), transport, data: sessionData });
    for (let i = 0; i < 10; i++) moveCursor("p1", { x: i, y: i });
    expect(t.cursors).toEqual([{ x: 0, y: 0 }]);
    vi.advanceTimersByTime(CURSOR_THROTTLE_MS);
    expect(t.cursors).toEqual([{ x: 0, y: 0 }, { x: 9, y: 9 }]);
    moveCursor("other-page", { x: 1, y: 1 });
    vi.advanceTimersByTime(CURSOR_THROTTLE_MS);
    expect(t.cursors).toHaveLength(2);
  });

  it("остановка закрывает соединение и сбрасывает состояние", () => {
    const { t, transport } = fakeTransport();
    const s = startPageRealtime({ pageId: "p1", workspaceId: "w1", me: me("k1"), transport, data: sessionData });
    s();
    expect(t.closed).toBe(true);
    expect(useRealtime.getState().pageId).toBeNull();
    t.handlers!.onOps([{ kind: "upsert", element: el("z", T(9)) }]);
    expect(useEditor.getState().els.z).toBeUndefined();
  });

  it("throttle с отменой не вызывает отложенное значение", () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const f = throttle((v: number) => calls.push(v), 100);
    f(1); f(2); f.cancel();
    vi.advanceTimersByTime(200);
    expect(calls).toEqual([1]);
  });
});

/** Демо-режим: настоящие BroadcastChannel между «вкладками» */
describe("Демо-транспорт BroadcastChannel", () => {
  type Seen = { ops: RemoteOp[]; peers: PresenceInfo[]; cursors: unknown[]; roles: unknown[]; status: string[] };
  const open = (page: string, info: PresenceInfo) => {
    const seen: Seen = { ops: [], peers: [], cursors: [], roles: [], status: [] };
    const conn = broadcastTransport.open({ pageId: page, workspaceId: "w1", me: info }, {
      onOps: (o) => seen.ops.push(...o), onStatus: (s) => seen.status.push(s), onPresence: (p) => (seen.peers = p),
      onCursor: (c) => seen.cursors.push(c), onRole: (r) => seen.roles.push(r),
    });
    return { conn, seen };
  };
  const conns: { conn: { close(): void } }[] = [];
  afterEach(() => { conns.splice(0).forEach((c) => c.conn.close()); vi.useRealTimers(); });
  const waitFor = async (check: () => boolean, ms = 2000) => {
    const start = Date.now();
    while (!check()) { if (Date.now() - start > ms) throw new Error("timeout"); await tick(5); }
    return Date.now() - start;
  };

  it("три участника видят имена друг друга и курсоры быстрее 2 секунд", async () => {
    const a = open("pg", me("a")), b = open("pg", me("b")), c = open("pg", me("c"));
    conns.push(a, b, c);
    const names = (s: Seen) => s.peers.map((p) => p.name).sort();
    const elapsed = await waitFor(() => [a, b, c].every((x) => x.seen.peers.length === 3));
    expect(elapsed).toBeLessThan(2000);
    expect(names(a.seen)).toEqual(["User a", "User b", "User c"]);
    expect(a.seen.status).toContain("live");
    b.conn.sendCursor({ x: 10, y: 20 });
    c.conn.sendCursor({ x: 30, y: 40 });
    expect(await waitFor(() => a.seen.cursors.length === 2)).toBeLessThan(2000);
    expect(a.seen.cursors).toEqual(expect.arrayContaining([{ key: "b", cursor: { x: 10, y: 20 } }, { key: "c", cursor: { x: 30, y: 40 } }]));
  });

  it("изменения объектов доходят до другой вкладки той же страницы и не уходят на чужую", async () => {
    const a = open("pg", me("a")), b = open("pg", me("b")), other = open("pg-2", me("c"));
    conns.push(a, b, other);
    a.conn.publishOps([{ kind: "upsert", element: el("x", T(1)) }, { kind: "delete", id: "y", at: T(1) }]);
    await waitFor(() => b.seen.ops.length === 2);
    await tick(20);
    expect(a.seen.ops).toHaveLength(0);
    expect(other.seen.ops).toHaveLength(0);
  });

  it("ушедший участник пропадает сразу", async () => {
    const a = open("pg", me("a")), b = open("pg", me("b"));
    conns.push(a);
    await waitFor(() => a.seen.peers.length === 2);
    b.conn.close();
    await waitFor(() => a.seen.peers.length === 1);
  });

  it("участник без пульса исчезает по таймауту", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "Date"] });
    const a = open("pg", me("a"));
    conns.push(a);
    const silent = new BroadcastChannel("nexora:page:pg");
    silent.postMessage({ t: "here", peer: me("ghost") });
    await waitFor(() => a.seen.peers.length === 2);
    vi.advanceTimersByTime(PEER_TTL_MS + 1500);
    expect(a.seen.peers.map((p) => p.key)).toEqual(["a"]);
    silent.close();
  });

  it("смена роли приходит только в свою тетрадь", async () => {
    const a = open("pg", me("a", "user-1"));
    conns.push(a);
    announceRoleChange("user-1", "w2", "viewer");
    announceRoleChange("user-1", "w1", "viewer");
    await waitFor(() => a.seen.roles.length === 1);
    await tick(20);
    expect(a.seen.roles).toEqual([{ workspaceId: "w1", role: "viewer" }]);
  });
});
