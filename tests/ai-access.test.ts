import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { aiAccess, isAiAdmin } from "@/lib/ai/access";

const confirmed = "2026-11-01T00:00:00Z";
const env = { ids: process.env.ADMIN_USER_IDS, emails: process.env.ADMIN_EMAILS };

describe("ИИ-функции: доступ администратора", () => {
  afterEach(() => {
    process.env.ADMIN_USER_IDS = env.ids;
    process.env.ADMIN_EMAILS = env.emails;
    if (env.ids === undefined) delete process.env.ADMIN_USER_IDS;
    if (env.emails === undefined) delete process.env.ADMIN_EMAILS;
  });

  it("без настроек администраторов нет, и обычным пользователям ИИ выключен", () => {
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_EMAILS;
    expect(aiAccess({ id: "u1", email: "a@b.c", email_confirmed_at: confirmed })).toEqual({ admin: false, perHour: 0, enabled: false });
  });

  it("узнаёт администратора по id и по подтверждённой почте, без учёта регистра и пробелов", () => {
    process.env.ADMIN_USER_IDS = " ID-1 , id-2";
    process.env.ADMIN_EMAILS = "Owner@Example.com; other@example.com";
    expect(isAiAdmin({ id: "id-1" })).toBe(true);
    expect(isAiAdmin({ id: "x", email: "owner@example.COM", email_confirmed_at: confirmed })).toBe(true);
    expect(aiAccess({ id: "id-2" })).toEqual({ admin: true, perHour: 1000, enabled: true });
  });

  it("неподтверждённая почта администратора не даёт доступа", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAiAdmin({ id: "x", email: "owner@example.com", email_confirmed_at: null })).toBe(false);
  });
});
