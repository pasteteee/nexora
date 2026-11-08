import { beforeEach, describe, expect, it, vi } from "vitest";
import "./setup-storage";
import { consumeToken, localAuth, localData } from "@/lib/data/local";
import { demoInviteInbox, localCollab as collab } from "@/lib/collab/local";
import { invitationFailure, invitationStatus, normalizeEmail } from "@/lib/collab/types";

async function user(email: string, verify = true) {
  await localAuth.signUp(email, "secret123", email.split("@")[0]);
  if (verify) {
    const link = localAuth.demoInbox(email)!;
    await consumeToken(new URL(link.url, "http://x").searchParams.get("confirm")!, "confirm");
  } else {
    await localAuth.signIn(email, "secret123");
  }
}
async function as(email: string) {
  await localAuth.signOut();
  await localAuth.signIn(email, "secret123");
}
const tokenOf = (link: string) => link.split("/").pop()!;

vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => localStorage.clear());

describe("приглашения (демо повторяет SQL-правила)", () => {
  async function setup() {
    await user("owner@x.ru");
    const ws = await localData.createWorkspace("Общая");
    await user("ed@x.ru");
    await user("late@x.ru");
    await user("raw@x.ru", false);
    await as("owner@x.ru");
    return ws;
  }

  it("владелец приглашает, приглашённый принимает один раз", async () => {
    const ws = await setup();
    const r = await collab.invite(ws.id, "  ED@x.ru ", "editor");
    expect(r.invitation).toMatchObject({ email: "ed@x.ru", role: "editor", status: "pending" });
    expect(Date.parse(r.invitation.expiresAt) - Date.parse(r.invitation.createdAt)).toBe(72 * 36e5);
    expect(demoInviteInbox("ed@x.ru")).toBe(r.link);
    await as("ed@x.ru");
    expect(await collab.acceptInvitation(tokenOf(r.link))).toBe(ws.id);
    expect((await localData.getWorkspace(ws.id))?.role).toBe("editor");
    await expect(collab.acceptInvitation(tokenOf(r.link))).rejects.toMatchObject({ reason: "used" });
  });

  it("только владелец приглашает; участника повторно не приглашают", async () => {
    const ws = await setup();
    const r = await collab.invite(ws.id, "ed@x.ru", "viewer");
    await as("ed@x.ru");
    await collab.acceptInvitation(tokenOf(r.link));
    await expect(collab.invite(ws.id, "late@x.ru", "viewer")).rejects.toMatchObject({ code: "not_found" });
    await as("owner@x.ru");
    await expect(collab.invite(ws.id, "ED@x.ru", "editor")).rejects.toThrow("Пользователь уже является участником");
    await expect(collab.invite(ws.id, "плохой", "editor")).rejects.toMatchObject({ code: "invalid" });
  });

  it("чужой адрес, неподтверждённый адрес, отзыв, истечение", async () => {
    const ws = await setup();
    const first = await collab.invite(ws.id, "late@x.ru", "viewer");
    const second = await collab.invite(ws.id, "late@x.ru", "editor");
    const raw = await collab.invite(ws.id, "raw@x.ru", "viewer");
    await as("ed@x.ru");
    await expect(collab.acceptInvitation(tokenOf(second.link))).rejects.toMatchObject({ reason: "email_mismatch" });
    await as("raw@x.ru");
    await expect(collab.acceptInvitation(tokenOf(raw.link))).rejects.toMatchObject({ reason: "email_unverified" });
    await as("late@x.ru");
    await expect(collab.acceptInvitation(tokenOf(first.link))).rejects.toMatchObject({ reason: "revoked" });
    await expect(collab.acceptInvitation("нет-такого")).rejects.toMatchObject({ reason: "invalid" });

    await as("owner@x.ru");
    await collab.revokeInvitation(second.invitation.id);
    const statuses = (await collab.listInvitations(ws.id)).map((i) => i.status).sort();
    expect(statuses).toEqual(["pending", "revoked", "revoked"]);
    await as("late@x.ru");
    await expect(collab.acceptInvitation(tokenOf(second.link))).rejects.toMatchObject({ reason: "revoked" });

    await as("owner@x.ru");
    const third = await collab.invite(ws.id, "late@x.ru", "viewer");
    vi.useFakeTimers({ now: Date.now() + 72 * 36e5 + 1000, toFake: ["Date"] });
    try {
      await as("late@x.ru");
      await expect(collab.acceptInvitation(tokenOf(third.link))).rejects.toMatchObject({ reason: "expired" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("роли, исключение и передача владения", () => {
  async function team() {
    await user("owner@x.ru");
    const ws = await localData.createWorkspace();
    for (const [email, role] of [["ed@x.ru", "editor"], ["view@x.ru", "viewer"]] as const) {
      await user(email);
      await as("owner@x.ru");
      const r = await collab.invite(ws.id, email, role);
      await as(email);
      await collab.acceptInvitation(tokenOf(r.link));
    }
    await as("owner@x.ru");
    const ids = Object.fromEntries((await collab.listMembers(ws.id)).map((m) => [m.email, m.userId]));
    return { ws, ids };
  }

  it("список участников: владелец видит адреса, остальные — только свой", async () => {
    const { ws } = await team();
    const members = await collab.listMembers(ws.id);
    expect(members.map((m) => m.role)).toEqual(["owner", "editor", "viewer"]);
    expect(members.every((m) => m.email)).toBe(true);
    await as("view@x.ru");
    const seen = await collab.listMembers(ws.id);
    expect(seen.filter((m) => m.email).map((m) => m.email)).toEqual(["view@x.ru"]);
    expect(seen.find((m) => m.isMe)?.role).toBe("viewer");
  });

  it("смена роли ограничивает доступ; редактор не управляет участниками", async () => {
    const { ws, ids } = await team();
    await collab.setRole(ws.id, ids["ed@x.ru"], "viewer");
    await as("ed@x.ru");
    await expect(localData.createCanvas(ws.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(collab.setRole(ws.id, ids["view@x.ru"], "editor")).rejects.toBeTruthy();
    await expect(collab.removeMember(ws.id, ids["view@x.ru"])).rejects.toMatchObject({ code: "forbidden" });
    await as("owner@x.ru");
    await expect(collab.setRole(ws.id, ids["owner@x.ru"], "viewer")).rejects.toMatchObject({ code: "not_found" });
  });

  it("исключение и выход закрывают доступ", async () => {
    const { ws, ids } = await team();
    await collab.removeMember(ws.id, ids["view@x.ru"]);
    await as("view@x.ru");
    expect(await localData.getWorkspace(ws.id)).toBeNull();
    await as("ed@x.ru");
    await collab.leave(ws.id);
    expect(await localData.listWorkspaces()).toEqual([]);
    await as("owner@x.ru");
    await expect(collab.leave(ws.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("передача владения: прежний владелец становится редактором", async () => {
    const { ws, ids } = await team();
    await collab.transferOwnership(ws.id, ids["view@x.ru"]);
    expect((await localData.getWorkspace(ws.id))?.role).toBe("editor");
    await expect(collab.invite(ws.id, "new@x.ru", "viewer")).rejects.toBeTruthy();
    await as("view@x.ru");
    expect((await localData.getWorkspace(ws.id))?.role).toBe("owner");
    await expect(localData.trashWorkspace(ws.id)).resolves.toBeUndefined();
  });
});

describe("публикации", () => {
  it("владелец/редактор публикует, отключение и повторная публикация меняют ссылку", async () => {
    await user("owner@x.ru");
    const ws = await localData.createWorkspace();
    const [page] = await localData.listCanvases(ws.id);
    await localData.upsertElements([
      { id: crypto.randomUUID(), canvasId: page.id, type: "text", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1,
        content: { text: "# Тема", documentOrder: 1, secret: "NEVER" }, style: { fontSize: 16, storage: "NEVER" },
        sourceId: null, groupId: null, createdBy: null, updatedAt: "" },
      { id: crypto.randomUUID(), canvasId: page.id, type: "image", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 2,
        content: { path: "NEVER/private.png" }, style: {}, sourceId: null, groupId: null, createdBy: null, updatedAt: "" },
    ]);
    expect(await collab.getPublication(page.id)).toBeNull();
    const pub = await collab.publish(page.id);
    expect(pub.slug).toMatch(/^[0-9a-f]{48}$/);
    expect(pub.path).toBe(`/p/${pub.slug}`);
    expect((await collab.publish(page.id)).slug).toBe(pub.slug);

    await localAuth.signOut();
    const shown = await collab.getPublishedCanvas(pub.slug);
    expect(shown?.elements).toHaveLength(1);
    expect(JSON.stringify(shown)).not.toContain("NEVER");
    expect(shown?.elements[0].content_json).toEqual({ text: "# Тема", documentOrder: 1 });

    await localAuth.signIn("owner@x.ru", "secret123");
    await collab.unpublish(page.id);
    expect(await collab.getPublishedCanvas(pub.slug)).toBeNull();
    const again = await collab.publish(page.id);
    expect(again.slug).not.toBe(pub.slug);
    await localData.trashCanvas(page.id);
    expect(await collab.getPublishedCanvas(again.slug)).toBeNull();
    await localData.restoreCanvas(page.id);
    await localData.trashWorkspace(ws.id);
    expect(await collab.getPublishedCanvas(again.slug)).toBeNull();
    await localData.restoreWorkspace(ws.id);
    expect(await collab.getPublishedCanvas(again.slug)).not.toBeNull();
  });

  it("наблюдатель и посторонний не публикуют", async () => {
    await user("owner@x.ru");
    const ws = await localData.createWorkspace();
    const [page] = await localData.listCanvases(ws.id);
    await user("view@x.ru");
    await as("owner@x.ru");
    const r = await collab.invite(ws.id, "view@x.ru", "viewer");
    await as("view@x.ru");
    await collab.acceptInvitation(tokenOf(r.link));
    await expect(collab.publish(page.id)).rejects.toMatchObject({ code: "forbidden" });
    await user("out@x.ru");
    await expect(collab.publish(page.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(collab.getPublication(page.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("вспомогательные функции", () => {
  it("коды ошибок RPC и статусы приглашений", () => {
    expect(invitationFailure("invitation_email_unverified")).toBe("email_unverified");
    expect(invitationFailure("Authentication required")).toBe("auth");
    expect(invitationFailure("что-то иное")).toBe("invalid");
    expect(normalizeEmail(" A@B.Ru ")).toBe("a@b.ru");
    expect(normalizeEmail("a@b")).toBeNull();
    const t = Date.parse("2026-01-01T00:00:00Z");
    expect(invitationStatus({ expiresAt: "2026-01-02T00:00:00Z" }, t)).toBe("pending");
    expect(invitationStatus({ expiresAt: "2025-12-31T00:00:00Z" }, t)).toBe("expired");
    expect(invitationStatus({ expiresAt: "2026-01-02T00:00:00Z", revokedAt: "x" }, t)).toBe("revoked");
  });
});
