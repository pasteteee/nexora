import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/knowledge/server", () => ({ admin: mocks.admin }));
import { purgeExpiredTrash, type PurgeClient } from "@/lib/trash/purge";
import { GET } from "@/app/api/cron/purge-trash/route";

type Row = Record<string, unknown>;
const NOW = new Date("2026-11-08T00:00:00Z");
const old = "2026-09-01T00:00:00Z", recent = "2026-11-01T00:00:00Z";
const WS = "11111111-1111-4111-8111-111111111111", WS2 = "22222222-2222-4222-8222-222222222222";

/** In-memory stand-in for the service-role Supabase client (only what purge uses). */
function fake(tables: Record<string, Row[]>, files: Record<string, string[]>) {
  const removed: string[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let del = false;
    const q = {
      select: () => q, delete: () => { del = true; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      lt: (c: string, v: string) => { filters.push((r) => typeof r[c] === "string" && (r[c] as string) < v); return q; },
      not: (c: string) => { filters.push((r) => r[c] != null); return q; },
      is: (c: string) => { filters.push((r) => r[c] == null); return q; },
      in: () => q,
      then(ok: (r: { data: Row[]; error: null }) => unknown) {
        const hit = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (del) {
          tables[table] = tables[table].filter((r) => !hit.includes(r));
          if (table === "workspaces") for (const t of ["canvases", "elements"]) tables[t] = tables[t].filter((r) => !hit.some((w) => w.id === r.workspace_id));
          if (table === "canvases") tables.elements = tables.elements.filter((r) => !hit.some((c) => c.id === r.canvas_id));
        }
        return Promise.resolve({ data: hit, error: null }).then(ok);
      },
    };
    return q;
  };
  const storage = { from: (bucket: string) => ({
    async list(dir: string) {
      const names = new Map<string, boolean>();
      for (const f of files[bucket] ?? []) if (f.startsWith(dir + "/")) { const rest = f.slice(dir.length + 1); const [head, ...tail] = rest.split("/"); names.set(head, tail.length > 0); }
      return { data: [...names].map(([name, folder]) => ({ name, id: folder ? null : name })), error: null };
    },
    async remove(paths: string[]) { removed.push(...paths.map((p) => `${bucket}:${p}`)); files[bucket] = (files[bucket] ?? []).filter((f) => !paths.includes(f)); return { data: null, error: null }; },
  }) };
  return { client: { from, storage } as unknown as PurgeClient, removed, tables };
}

describe("очистка корзины через 30 дней", () => {
  it("удаляет просроченные тетради вместе с файлами, свежие не трогает", async () => {
    const f = fake({
      workspaces: [{ id: WS, deleted_at: old }, { id: WS2, deleted_at: recent }],
      canvases: [], elements: [],
    }, { "nexora-sources": [`${WS}/s1/a.pdf`, `${WS2}/s2/b.pdf`], "nexora-images": [`${WS}/i1/p.png`] });
    const r = await purgeExpiredTrash(f.client, NOW);
    expect(r).toEqual({ workspaces: 1, pages: 0, files: 2 });
    expect(f.tables.workspaces.map((w) => w.id)).toEqual([WS2]);
    expect(f.removed.sort()).toEqual([`nexora-images:${WS}/i1/p.png`, `nexora-sources:${WS}/s1/a.pdf`]);
  });

  it("удаляет просроченную страницу и только неиспользуемые изображения", async () => {
    const f = fake({
      workspaces: [{ id: WS, deleted_at: null }],
      canvases: [{ id: "c-old", workspace_id: WS, deleted_at: old }, { id: "c-copy", workspace_id: WS, deleted_at: null }],
      elements: [
        { canvas_id: "c-old", workspace_id: WS, type: "image", content_json: { path: `${WS}/a/shared.png` } },
        { canvas_id: "c-old", workspace_id: WS, type: "image", content_json: { path: `${WS}/b/own.png` } },
        { canvas_id: "c-copy", workspace_id: WS, type: "image", content_json: { path: `${WS}/a/shared.png` } },
      ],
    }, { "nexora-images": [`${WS}/a/shared.png`, `${WS}/b/own.png`] });
    const r = await purgeExpiredTrash(f.client, NOW);
    expect(r).toEqual({ workspaces: 0, pages: 1, files: 1 });
    expect(f.removed).toEqual([`nexora-images:${WS}/b/own.png`]);
    expect(f.tables.canvases.map((c) => c.id)).toEqual(["c-copy"]);
  });
});

describe("GET /api/cron/purge-trash", () => {
  beforeEach(() => { mocks.admin.mockReset(); process.env.CRON_SECRET = "cron-secret-0123456789"; });
  it("без секрета отвечает 401 и ничего не удаляет", async () => {
    const res = await GET(new Request("http://x/api/cron/purge-trash", { headers: { authorization: "Bearer wrong" } }));
    expect(res.status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("с секретом запускает очистку", async () => {
    mocks.admin.mockReturnValue(fake({ workspaces: [], canvases: [], elements: [] }, {}).client);
    const res = await GET(new Request("http://x/api/cron/purge-trash", { headers: { authorization: "Bearer cron-secret-0123456789" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workspaces: 0, pages: 0, files: 0 });
  });
});
