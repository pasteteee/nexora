import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { generate } from "@/lib/knowledge/provider";
async function collect() {
  let text = "";
  for await (const part of generate([{ role: "user", content: "question" }]))
    text += part;
  return text;
}
describe("provider stream completion", () => {
  beforeEach(() => {
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_PROVIDER", "openai");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  function stream(text: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(text, {
            headers: { "Content-Type": "text/event-stream" },
          }),
      ),
    );
  }
  it("requires OpenAI terminal marker", async () => {
    stream('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
    await expect(collect()).rejects.toThrow("прерван");
  });
  it("accepts complete OpenAI response", async () => {
    stream(
      'data: {"choices":[{"delta":{"content":"complete"}}]}\n\ndata: [DONE]\n\n',
    );
    await expect(collect()).resolves.toBe("complete");
  });
  it("rejects provider error objects", async () => {
    stream(
      'data: {"error":{"message":"sensitive provider diagnostic"}}\n\ndata: [DONE]\n\n',
    );
    await expect(collect()).rejects.toThrow("Ошибка сервиса ИИ");
  });
  it("requires Anthropic message_stop", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    stream(
      'data: {"type":"content_block_delta","delta":{"text":"partial"}}\n\n',
    );
    await expect(collect()).rejects.toThrow("прерван");
  });
  it("accepts Anthropic message_stop", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    stream(
      'data: {"type":"content_block_delta","delta":{"text":"complete"}}\n\ndata: {"type":"message_stop"}\n\n',
    );
    await expect(collect()).resolves.toBe("complete");
  });
});
