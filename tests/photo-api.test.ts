import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ access: vi.fn(), reserve: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: vi.fn() }));
vi.mock("@/lib/knowledge/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/knowledge/server")>("@/lib/knowledge/server");
  return { ...actual, access: mocks.access, reserveOperation: mocks.reserve };
});
import { POST } from "@/app/api/ai/photo/route";
import { HttpError } from "@/lib/knowledge/server";

const workspaceId = "00000000-0000-4000-8000-000000000001";
function request(image: Blob | null = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), hint = "auto") {
  const form = new FormData();
  form.set("workspaceId", workspaceId);
  form.set("hint", hint);
  if (image) form.set("image", image, "photo.jpg");
  return new Request("http://localhost/api/ai/photo", { method: "POST", body: form });
}
const gemini = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });

describe("фото в тетрадь: API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.access.mockReset().mockResolvedValue({ user: { id: "me" } });
    mocks.update.mockReset();
    const worker = { from: () => ({ update: (v: unknown) => { mocks.update(v); return { eq: async () => ({}) }; } }) };
    mocks.reserve.mockReset().mockResolvedValue({ worker, logId: "log" });
    process.env.EMBEDDINGS_PROVIDER = "gemini";
    process.env.EMBEDDINGS_API_KEY = "test-key";
    delete process.env.GEMINI_API_KEY;
  });

  it("отправляет фото в Gemini и возвращает проверенные блоки", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(gemini({ candidates: [{ content: { parts: [{ text: JSON.stringify({ blocks: [
      { kind: "heading", text: "Тема", level: 2 }, { kind: "formula", formula: "\\frac{1}{x}" }, { kind: "plot", fn: "y = x^2", xmin: -2, xmax: 2 },
    ] }) }] } }] }));
    const res = await POST(request(undefined, "formula"));
    expect(res.status).toBe(200);
    const { blocks } = await res.json();
    expect(blocks.map((b: { kind: string }) => b.kind)).toEqual(["text", "formula", "plot"]);
    expect(blocks[1].src).toBe("(1)/(x)");
    expect(blocks[2].fn).toBe("x^2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(":generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].inlineData).toEqual({ mimeType: "image/jpeg", data: "AQID" });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(mocks.reserve).toHaveBeenCalledWith(workspaceId, "me", "photo_import");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("если модели нет у ключа (404), пробует следующую", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(gemini({ error: { code: 404 } }, 404))
      .mockResolvedValueOnce(gemini({ candidates: [{ content: { parts: [{ text: "{\"blocks\":[{\"kind\":\"text\",\"text\":\"Привет\"}]}" }] } }] }));
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).not.toBe(String(fetchMock.mock.calls[0][0]));
  });

  it("до миграции запрос записывается как explain, лимит действует", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(gemini({ candidates: [{ content: { parts: [{ text: "{\"blocks\":[]}" }] } }] }));
    const worker = { from: () => ({ update: () => ({ eq: async () => ({}) }) }) };
    mocks.reserve.mockReset().mockRejectedValueOnce(new HttpError(503, "Сервис временно недоступен")).mockResolvedValueOnce({ worker, logId: "log" });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.reserve).toHaveBeenLastCalledWith(workspaceId, "me", "explain");
    mocks.reserve.mockReset().mockRejectedValue(new HttpError(429, "Лимит запросов за час исчерпан"));
    expect((await POST(request())).status).toBe(429);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });

  it("без фото и с неверным типом отвечает 400 и 415, лимит не тратится", async () => {
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(request(new Blob(["x"], { type: "application/pdf" })))).status).toBe(415);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("читатель тетради не может распознавать", async () => {
    mocks.access.mockRejectedValue(new HttpError(403, "Нет доступа к этой операции"));
    expect((await POST(request())).status).toBe(403);
  });

  it("ошибка сервиса записывается в журнал и понятна пользователю", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(gemini({ error: {} }, 429));
    const res = await POST(request());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/перегружен/);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("без ключа Gemini объясняет, что настроить", async () => {
    delete process.env.EMBEDDINGS_API_KEY;
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/ключ Gemini/);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
