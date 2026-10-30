import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  admin: vi.fn(),
  search: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@/lib/knowledge/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/knowledge/server")>(
    "@/lib/knowledge/server",
  );
  return { ...actual, access: mocks.access, admin: mocks.admin };
});
vi.mock("@/lib/knowledge/search", () => ({ search: mocks.search }));
vi.mock("@/lib/knowledge/provider", () => ({ generate: mocks.generate }));
import { POST } from "@/app/api/ai/ask/route";
import { HttpError } from "@/lib/knowledge/server";
const workspaceId = "00000000-0000-4000-8000-000000000001",
  canvasId = "00000000-0000-4000-8000-000000000002";
const request = (extra = {}) =>
  new Request("http://localhost/api/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      canvasId,
      prompt: "Explain the lecture",
      ...extra,
    }),
  });
function chain(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is", "update"])
    builder[name] = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve);
  return builder;
}
describe("assistant API isolation and streaming", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({
      user: { id: "me" },
      sb: { from: vi.fn(() => chain({ data: { id: canvasId } })) },
    });
    mocks.admin.mockReturnValue({
      rpc: vi.fn(async () => ({ data: "request-id" })),
      from: vi.fn(() => chain({ error: null })),
    });
    mocks.search.mockResolvedValue([]);
    mocks.generate.mockImplementation(async function* () {
      yield "A useful ";
      yield "answer.";
    });
  });
  it("rejects viewers before touching search or AI", async () => {
    mocks.access.mockRejectedValue(new HttpError(403, "Нет доступа"));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("rejects a canvas outside the authorized workspace", async () => {
    mocks.access.mockResolvedValue({
      user: { id: "me" },
      sb: { from: () => chain({ data: null }) },
    });
    expect((await POST(request())).status).toBe(404);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("streams a preview without mutating any source element", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events).toEqual([
      { type: "sources", sources: [] },
      { type: "text", text: "A useful " },
      { type: "text", text: "answer." },
      { type: "done" },
    ]);
    expect(mocks.access).toHaveBeenCalledWith(workspaceId, true);
    expect(mocks.search).toHaveBeenCalledWith(
      workspaceId,
      "Explain the lecture",
      expect.any(AbortSignal),
    );
    const payload = JSON.parse(mocks.generate.mock.calls[0][0][1].content);
    expect(payload.selected).toEqual([]);
    expect(payload.nearby).toEqual([]);
    expect(payload.workspaceId).toBe(workspaceId);
  });
  it("rate limits before external provider work", async () => {
    mocks.admin.mockReturnValue({
      rpc: async () => ({ error: { message: "AI_RATE_LIMIT" } }),
    });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("reports provider failure as a recoverable streamed error", async () => {
    mocks.generate.mockImplementation(async function* () {
      throw new Error("private provider secret");
    });
    const response = await POST(request());
    const text = await response.text();
    expect(text).toContain('"type":"error"');
    expect(text).not.toContain("private provider secret");
  });
});
