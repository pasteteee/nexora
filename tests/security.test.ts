import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-redirect";
import config from "@/next.config";

describe("адрес возврата после входа", () => {
  it.each([
    ["/app/w/1/p/2", "/app/w/1/p/2"],
    ["/app/invite/abc?x=1#h", "/app/invite/abc?x=1#h"],
    [null, "/app"],
    ["", "/app"],
    ["https://evil.example", "/app"],
    ["//evil.example/app", "/app"],
    ["/\\evil.example", "/app"],
    ["/\tevil", "/app"],
    ["javascript:alert(1)", "/app"],
    ["app", "/app"],
    ["/" + "a".repeat(3000), "/app"],
  ])("%s → %s", (input, expected) => expect(safeNext(input)).toBe(expected));
});

describe("заголовки безопасности", () => {
  it("запрещают встраивание и скрывают секреты в адресе публичных страниц", async () => {
    const rules = await config.headers!();
    const all = Object.fromEntries(rules.find((r) => r.source === "/:path*")!.headers.map((h) => [h.key, h.value]));
    expect(all["X-Frame-Options"]).toBe("DENY");
    expect(all["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(all["X-Content-Type-Options"]).toBe("nosniff");
    for (const source of ["/p/:slug", "/app/invite/:token"]) {
      const h = Object.fromEntries(rules.find((r) => r.source === source)!.headers.map((x) => [x.key, x.value]));
      expect(h["Referrer-Policy"]).toBe("no-referrer");
      expect(h["X-Robots-Tag"]).toContain("noindex");
    }
  });
});
