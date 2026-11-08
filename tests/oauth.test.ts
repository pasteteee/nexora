import { describe, expect, it } from "vitest";
import { oauthDisplayName } from "@/lib/oauth-name";
import { safeNext } from "@/lib/safe-redirect";

describe("вход через Google", () => {
  it("берёт имя из full_name или name", () => {
    expect(oauthDisplayName({ full_name: "  Анна Петрова " })).toBe("Анна Петрова");
    expect(oauthDisplayName({ name: "Anna" })).toBe("Anna");
    expect(oauthDisplayName({ display_name: "Своё", full_name: "Google" })).toBe("Своё");
    expect(oauthDisplayName({})).toBe("");
    expect(oauthDisplayName(null)).toBe("");
    expect(oauthDisplayName({ full_name: "x".repeat(200) })).toHaveLength(120);
  });

  it("callback не уводит на чужой сайт через ?next=", () => {
    expect(safeNext("https://evil.example")).toBe("/app");
    expect(safeNext("//evil.example/app")).toBe("/app");
    expect(safeNext("/app/invite/abc")).toBe("/app/invite/abc");
  });
});
