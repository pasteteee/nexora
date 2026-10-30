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
    vi.stubEnv("AI_MODEL", "");
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
  it("streams xAI Responses with the xAI key and disables response storage", async () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("AI_MODEL", "grok-4.7");
    stream('data: {"type":"response.output_text.delta","delta":"Grok answer"}\n\ndata: {"type":"response.completed"}\n\n');
    await expect(collect()).resolves.toBe("Grok answer");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/responses");
    expect(init?.headers).toMatchObject({Authorization:"Bearer test-key"});
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model:"grok-4.7", input:[{role:"user",content:"question"}], store:false, stream:true,
    });
  });
  it("does not accept a chat terminal marker as a completed xAI response", async () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    stream('data: {"type":"response.output_text.delta","delta":"partial"}\n\ndata: [DONE]\n\n');
    await expect(collect()).rejects.toThrow("прерван");
  });
  it.each(["response.failed", "response.incomplete"])("rejects xAI %s", async (type) => {
    vi.stubEnv("AI_PROVIDER", "xai");
    stream(`data: ${JSON.stringify({type})}\n\n`);
    await expect(collect()).rejects.toThrow("не завершён");
  });
  it("rejects unknown providers without sending a key to another service", async () => {
    vi.stubEnv("AI_PROVIDER", "unknown");
    stream("");
    await expect(collect()).rejects.toThrow("AI_PROVIDER");
    expect(fetch).not.toHaveBeenCalled();
  });
});
