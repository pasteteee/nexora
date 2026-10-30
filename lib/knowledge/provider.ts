import "server-only";
import { withTimeout, type ChatMessage } from "@/lib/ai/provider";

async function checked(response: Response) {
  if (!response.ok) throw new Error("ИИ временно недоступен. Повторите запрос позже.");
  return response;
}
export async function embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  const key = process.env.EMBEDDINGS_API_KEY;
  if (!key) throw new Error("Не настроен сервис поиска: EMBEDDINGS_API_KEY");
  const response = await checked(await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.EMBEDDINGS_MODEL || "text-embedding-3-small", input: texts, dimensions: 1536 }), signal: withTimeout(signal),
  }));
  const json = await response.json();
  const vectors = json.data?.sort((a: {index:number},b: {index:number})=>a.index-b.index).map((x: {embedding:number[]})=>x.embedding);
  if (!Array.isArray(vectors) || vectors.length !== texts.length || vectors.some(v=>v.length!==1536 || v.some((n:number)=>!Number.isFinite(n)))) throw new Error("Неверный ответ сервиса поиска");
  return vectors;
}
export async function* generate(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string> {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("Не настроен AI_API_KEY");
  const anthropic = (process.env.AI_PROVIDER || "anthropic") === "anthropic";
  const response = await checked(await fetch(anthropic ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/chat/completions", {
    method: "POST", signal: withTimeout(signal), headers: anthropic ? {"x-api-key":key,"anthropic-version":"2023-06-01","Content-Type":"application/json"} : {Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body: JSON.stringify(anthropic ? {model:process.env.AI_MODEL || "claude-sonnet-4-5",max_tokens:2000,stream:true,system:messages.filter(m=>m.role==="system").map(m=>m.content).join("\n"),messages:messages.filter(m=>m.role!=="system")} : {model:process.env.AI_MODEL || "gpt-4.1-mini",max_tokens:2000,stream:true,messages}),
  }));
  if (!response.body) throw new Error("Пустой ответ ИИ");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "";
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      pending += decoder.decode(value,{stream:true});
      const lines = pending.split("\n"); pending = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ") || line.slice(6).trim() === "[DONE]") continue;
        const event = JSON.parse(line.slice(6));
        if (event.type === "error") throw new Error("Ошибка сервиса ИИ");
        const text = anthropic ? event.delta?.text : event.choices?.[0]?.delta?.content;
        if (typeof text === "string") yield text;
      }
    }
  } finally { await reader.cancel().catch(()=>{}); }
}
