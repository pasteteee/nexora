import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { embed, EMBEDDING_DIMENSIONS } from "@/lib/knowledge/provider";

const vec = (x: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, () => x);
function reply(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}
const call = () => vi.mocked(fetch).mock.calls[0] as [string, RequestInit];

describe("embeddings provider", () => {
  beforeEach(() => {
    vi.stubEnv("EMBEDDINGS_API_KEY", "emb-key");
    vi.stubEnv("EMBEDDINGS_PROVIDER", "");
    vi.stubEnv("EMBEDDINGS_MODEL", "");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses Gemini by default with document task and 1536 dimensions", async () => {
    reply({ embeddings: [{ values: vec(2) }, { values: vec(3) }] });
    const out = await embed(["a", "b"]);
    const [url, init] = call();
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "emb-key" });
    const body = JSON.parse(init.body as string);
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0]).toEqual({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: "a" }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 1536,
    });
    // Truncated Gemini vectors are normalised to unit length.
    expect(Math.hypot(...out[0])).toBeCloseTo(1, 6);
    expect(Math.hypot(...out[1])).toBeCloseTo(1, 6);
  });

  it("marks search queries as RETRIEVAL_QUERY", async () => {
    reply({ embeddings: [{ values: vec(1) }] });
    await embed(["question"], undefined, "query");
    expect(JSON.parse(call()[1].body as string).requests[0].taskType).toBe("RETRIEVAL_QUERY");
  });

  it("rejects a Gemini answer with the wrong count or size", async () => {
    reply({ embeddings: [{ values: vec(1) }] });
    await expect(embed(["a", "b"])).rejects.toThrow("Неверный ответ");
    reply({ embeddings: [{ values: [1, 2, 3] }] });
    await expect(embed(["a"])).rejects.toThrow("Неверный ответ");
  });

  it("hides provider errors", async () => {
    reply({ error: { message: "API key not valid" } }, 400);
    await expect(embed(["a"])).rejects.toThrow("ИИ временно недоступен");
  });

  it("still supports OpenAI when EMBEDDINGS_PROVIDER=openai", async () => {
    vi.stubEnv("EMBEDDINGS_PROVIDER", "openai");
    reply({ data: [{ index: 1, embedding: vec(1) }, { index: 0, embedding: vec(0.5) }] });
    const out = await embed(["a", "b"]);
    expect(call()[0]).toBe("https://api.openai.com/v1/embeddings");
    expect(out[0][0]).toBe(0.5);
  });

  it("requires a key and a known provider", async () => {
    vi.stubEnv("EMBEDDINGS_PROVIDER", "cohere");
    await expect(embed(["a"])).rejects.toThrow("EMBEDDINGS_PROVIDER");
    vi.stubEnv("EMBEDDINGS_API_KEY", "");
    await expect(embed(["a"])).rejects.toThrow("EMBEDDINGS_API_KEY");
  });
});
