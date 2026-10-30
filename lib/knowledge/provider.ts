import "server-only";
import { withTimeout, type ChatMessage } from "@/lib/ai/provider";

async function checked(response: Response) {
  if (!response.ok)
    throw new Error("ИИ временно недоступен. Повторите запрос позже.");
  return response;
}
export async function embed(
  texts: string[],
  signal?: AbortSignal,
): Promise<number[][]> {
  const key = process.env.EMBEDDINGS_API_KEY;
  if (!key) throw new Error("Не настроен сервис поиска: EMBEDDINGS_API_KEY");
  const response = await checked(
    await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.EMBEDDINGS_MODEL || "text-embedding-3-small",
        input: texts,
        dimensions: 1536,
      }),
      signal: withTimeout(signal),
    }),
  );
  const json = await response.json();
  const vectors = json.data
    ?.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((x: { embedding: number[] }) => x.embedding);
  if (
    !Array.isArray(vectors) ||
    vectors.length !== texts.length ||
    vectors.some(
      (v) => v.length !== 1536 || v.some((n: number) => !Number.isFinite(n)),
    )
  )
    throw new Error("Неверный ответ сервиса поиска");
  return vectors;
}
export async function* generate(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncIterable<string> {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("Не настроен AI_API_KEY");
  const provider = process.env.AI_PROVIDER || "anthropic";
  if (!["anthropic", "openai", "xai"].includes(provider))
    throw new Error("Неизвестный AI_PROVIDER");
  const anthropic = provider === "anthropic";
  const xai = provider === "xai";
  const response = await checked(
    await fetch(
      anthropic
        ? "https://api.anthropic.com/v1/messages"
        : xai ? "https://api.x.ai/v1/responses" : "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        signal: withTimeout(signal),
        headers: anthropic
          ? {
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            }
          : {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
        body: JSON.stringify(
          anthropic
            ? {
                model: process.env.AI_MODEL || "claude-sonnet-4-5",
                max_tokens: 2000,
                stream: true,
                system: messages
                  .filter((m) => m.role === "system")
                  .map((m) => m.content)
                  .join("\n"),
                messages: messages.filter((m) => m.role !== "system"),
              }
            : xai ? {
                model: process.env.AI_MODEL || "grok-4.7",
                input: messages,
                max_output_tokens: 4096,
                store: false,
                stream: true,
              } : {
                model: process.env.AI_MODEL || "gpt-4.1-mini",
                max_tokens: 2000,
                stream: true,
                messages,
              },
        ),
      },
    ),
  );
  if (!response.body) throw new Error("Пустой ответ ИИ");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;
  function parseLine(line: string): string | undefined {
    if (!line.startsWith("data: ")) return;
    if (line.slice(6).trim() === "[DONE]") {
      if (!anthropic && !xai) completed = true;
      return;
    }
    const event = JSON.parse(line.slice(6));
    if (event.error || event.type === "error")
      throw new Error("Ошибка сервиса ИИ");
    if (xai) {
      if (["response.failed", "response.incomplete"].includes(event.type))
        throw new Error("Ответ сервиса ИИ не завершён");
      if (event.type === "response.completed") completed = true;
      return event.type === "response.output_text.delta" && typeof event.delta === "string"
        ? event.delta : undefined;
    }
    if (anthropic && event.type === "message_stop") completed = true;
    const text = anthropic
      ? event.delta?.text
      : event.choices?.[0]?.delta?.content;
    return typeof text === "string" ? text : undefined;
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) {
        const text = parseLine(line);
        if (typeof text === "string") yield text;
      }
    }
    const finalText = parseLine(pending + decoder.decode());
    if (finalText) yield finalText;
    if (!completed) throw new Error("Поток ответа ИИ прерван");
  } finally {
    await reader.cancel().catch(() => {});
  }
}
