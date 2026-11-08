import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), from: vi.fn(), sendMail: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: mocks.rpc, from: mocks.from, auth: { getUser: mocks.getUser } }),
}));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mocks.sendMail }) } }));
import { POST as invite } from "@/app/api/workspaces/[workspaceId]/invitations/route";
import { DELETE as unpublish, POST as publish } from "@/app/api/publish/[canvasId]/route";
import { invitationLetter, smtpFromEnv } from "@/lib/collab/mail";

const ws = "00000000-0000-4000-8000-000000000001";
const page = "00000000-0000-4000-8000-000000000002";
const req = (url: string, init: RequestInit = {}, auth = true) =>
  new Request(`http://localhost${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer user.jwt.token" } : {}) },
  });
const row = (data: unknown) => ({ eq: () => ({ maybeSingle: async () => ({ data }) }) });

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");
  vi.stubEnv("APP_URL", "https://nexora.example");
  for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL"]) vi.stubEnv(k, "");
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  mocks.from.mockImplementation((t: string) => ({ select: () => row(t === "workspaces" ? { name: "Физика <b>" } : { display_name: "Аня" }) }));
});

describe("POST /api/workspaces/:id/invitations", () => {
  const body = (b: unknown) => ({ method: "POST", body: JSON.stringify(b) });

  it("без входа и с неверными данными — отказ до обращения к базе", async () => {
    expect((await invite(req(`/api/workspaces/${ws}/invitations`, body({ email: "a@b.ru", role: "editor" }), false), { params: Promise.resolve({ workspaceId: ws }) })).status).toBe(401);
    expect((await invite(req(`/api/workspaces/x/invitations`, body({ email: "a@b.ru", role: "editor" })), { params: Promise.resolve({ workspaceId: "x" }) })).status).toBe(400);
    expect((await invite(req(`/api/workspaces/${ws}/invitations`, body({ email: "a@b.ru", role: "owner" })), { params: Promise.resolve({ workspaceId: ws }) })).status).toBe(400);
    expect((await invite(req(`/api/workspaces/${ws}/invitations`, body({ email: "нет", role: "viewer" })), { params: Promise.resolve({ workspaceId: ws }) })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("создаёт приглашение от имени пользователя и возвращает ссылку без письма, если SMTP не задан", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ invitation_id: "i1", token: "t".repeat(64), expires_at: "2026-11-11T00:00:00Z" }], error: null });
    const res = await invite(req(`/api/workspaces/${ws}/invitations`, body({ email: " Bob@X.ru ", role: "viewer" })), { params: Promise.resolve({ workspaceId: ws }) });
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("create_workspace_invitation", { p_workspace_id: ws, p_email: "bob@x.ru", p_role: "viewer" });
    const json = await res.json();
    expect(json).toMatchObject({ emailed: false, link: `https://nexora.example/app/invite/${"t".repeat(64)}`, invitation: { email: "bob@x.ru", role: "viewer" } });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("с SMTP отправляет письмо; сбой почты не отменяет приглашение", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_USER", "bot@example.com");
    vi.stubEnv("SMTP_PASS", "secret");
    vi.stubEnv("SMTP_FROM_EMAIL", "bot@example.com");
    mocks.rpc.mockResolvedValue({ data: [{ invitation_id: "i1", token: "a".repeat(64), expires_at: "x" }], error: null });
    mocks.sendMail.mockResolvedValueOnce({ messageId: "1" }).mockRejectedValueOnce(new Error("smtp down"));
    const call = () => invite(req(`/api/workspaces/${ws}/invitations`, body({ email: "bob@x.ru", role: "editor" })), { params: Promise.resolve({ workspaceId: ws }) });
    expect((await (await call()).json()).emailed).toBe(true);
    const mail = mocks.sendMail.mock.calls[0][0];
    expect(mail.to).toBe("bob@x.ru");
    expect(mail.html).toContain("Физика &#60;b&#62;");
    expect(mail.text).toContain("72 часа");
    const failed = await call();
    expect(failed.status).toBe(201);
    expect((await failed.json()).emailed).toBe(false);
  });

  it("ошибки базы переводятся в понятные ответы без подробностей", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "dup" } })
      .mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Only the owner can invite members" } })
      .mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "internal secret detail" } });
    const call = () => invite(req(`/api/workspaces/${ws}/invitations`, body({ email: "bob@x.ru", role: "editor" })), { params: Promise.resolve({ workspaceId: ws }) });
    const dup = await call();
    expect([dup.status, (await dup.json()).error]).toEqual([409, "Пользователь уже является участником"]);
    expect((await call()).status).toBe(403);
    const other = await call();
    expect(other.status).toBe(503);
    expect(JSON.stringify(await other.json())).not.toContain("secret");
  });
});

describe("/api/publish/:canvasId", () => {
  const ctx = { params: Promise.resolve({ canvasId: page }) };
  it("публикация и отключение через проверяющие права функции", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ slug: "s".repeat(48), is_active: true, published_at: "2026-11-08T00:00:00Z" }], error: null });
    const res = await publish(req(`/api/publish/${page}`, { method: "POST" }), ctx);
    expect(await res.json()).toEqual({ publication: { canvasId: page, slug: "s".repeat(48), isActive: true, publishedAt: "2026-11-08T00:00:00Z", path: `/p/${"s".repeat(48)}` } });
    expect(mocks.rpc).toHaveBeenLastCalledWith("publish_canvas", { p_canvas_id: page });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await unpublish(req(`/api/publish/${page}`, { method: "DELETE" }), ctx)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("unpublish_canvas", { p_canvas_id: page });
  });
  it("наблюдатель получает 403, истёкшая сессия — 401", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "x" } });
    expect((await publish(req(`/api/publish/${page}`, { method: "POST" }), ctx)).status).toBe(403);
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "expired" } });
    expect((await unpublish(req(`/api/publish/${page}`, { method: "DELETE" }), ctx)).status).toBe(401);
  });
});

describe("письмо-приглашение", () => {
  it("SMTP необязателен; текст письма экранирует имена", () => {
    expect(smtpFromEnv({})).toBeNull();
    expect(smtpFromEnv({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM_EMAIL: "f@x.ru", SMTP_FROM_NAME: "N\r\nBcc: x" })?.fromName).toBe("NBcc: x");
    const l = invitationLetter({ workspaceName: "<script>", inviterName: "", role: "viewer", link: "https://x/app/invite/t" });
    expect(l.html).not.toContain("<script>");
    expect(l.text).toContain("Владелец тетради приглашает");
    expect(l.text).toContain("«наблюдатель»");
  });
});
