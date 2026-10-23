import { describe, expect, it } from "vitest";
import { cosine, withTimeout } from "@/lib/ai/provider";

describe("cosine", () => {
  it("1 для одинаковых векторов", () => expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1));
  it("0 для ортогональных", () => expect(cosine([1, 0], [0, 1])).toBe(0));
  it("0 для нулевого вектора", () => expect(cosine([0, 0], [1, 1])).toBe(0));
});

describe("withTimeout", () => {
  it("срабатывает по таймауту", async () => {
    const s = withTimeout(undefined, 10);
    await new Promise((r) => setTimeout(r, 30));
    expect(s.aborted).toBe(true);
  });
  it("срабатывает по отмене пользователя", () => {
    const c = new AbortController();
    const s = withTimeout(c.signal, 10_000);
    c.abort();
    expect(s.aborted).toBe(true);
  });
});
