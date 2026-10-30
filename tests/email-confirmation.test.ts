import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchange, rpc } = vi.hoisted(() => ({ exchange: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { exchangeCodeForSession: exchange }, rpc }),
}));
import { GET } from "@/app/auth/confirm/route";

beforeEach(() => { vi.resetAllMocks(); exchange.mockResolvedValue({ error: null }); rpc.mockResolvedValue({ error: null }); });
describe("email ownership callback", () => {
  it("does not mark a profile verified without a code", async () => {
    const response = await GET(new Request("https://nexora.test/auth/confirm"));
    expect(response.headers.get("location")).toBe("https://nexora.test/app/profile?verification=failed");
    expect(exchange).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects expired codes before touching the profile", async () => {
    exchange.mockResolvedValue({ error: { message: "expired" } });
    const response = await GET(new Request("https://nexora.test/auth/confirm?code=expired"));
    expect(response.headers.get("location")).toContain("verification=failed");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not claim success when the signed-session check rejects verification", async () => {
    rpc.mockResolvedValue({ error: { code: "42501" } });
    const response = await GET(new Request("https://nexora.test/auth/confirm?code=valid"));
    expect(response.headers.get("location")).toContain("verification=failed");
  });
  it("records proof after PKCE exchange, with a fixed internal redirect", async () => {
    const response = await GET(new Request("https://nexora.test/auth/confirm?code=valid&next=https://attacker.test"));
    expect(exchange).toHaveBeenCalledWith("valid");
    expect(rpc).toHaveBeenCalledWith("confirm_profile_email");
    expect(response.headers.get("location")).toBe("https://nexora.test/app/profile?verified=1");
  });
});
