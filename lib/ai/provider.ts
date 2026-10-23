/**
 * Единый серверный адаптер ИИ (ТЗ п. 4.1.1.1).
 * Интерфейс не зависит от поставщика; ключи читаются только на сервере.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  signal?: AbortSignal;
  /** Мс до принудительной отмены; по ТЗ — 60 000. */
  timeoutMs?: number;
  maxTokens?: number;
}

export interface AiProvider {
  readonly name: string;
  /** Потоковая генерация: отдаёт текст по частям. */
  generate(messages: ChatMessage[], opts?: GenerateOptions): AsyncIterable<string>;
  /** Векторные представления фрагментов, порядок совпадает с входом. */
  embed(texts: string[], opts?: { signal?: AbortSignal }): Promise<number[][]>;
}

export const AI_TIMEOUT_MS = 60_000;

/** Склеивает сигнал пользователя и таймаут в один AbortSignal. */
export function withTimeout(signal: AbortSignal | undefined, ms = AI_TIMEOUT_MS): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Косинусное сходство двух векторов одинаковой длины. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
