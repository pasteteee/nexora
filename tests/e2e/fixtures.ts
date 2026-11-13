import { expect, type Page } from "@playwright/test";
import type { LocalDb } from "../../lib/data/local";

export function fixture(role: "owner" | "viewer" | "outsider" = "owner") {
  const at = new Date().toISOString();
  const users = ["owner", "editor", "viewer", "outsider"].map(name => ({
    id: crypto.randomUUID(), email: `${name}@nexora.example.test`, displayName: name,
    emailVerified: true, confirmed: true, passHash: "unused-by-seeded-session",
  }));
  const workspaceId = crypto.randomUUID(), canvasId = crypto.randomUUID();
  const db: LocalDb = {
    users, tokens: {},
    workspaces: [{ id: workspaceId, ownerId: users[0].id, name: "QA notebook", createdAt: at, updatedAt: at, deletedAt: null }],
    members: users.slice(0, 3).map((user, index) => ({ workspaceId, userId: user.id, role: (["owner", "editor", "viewer"] as const)[index] })),
    canvases: [{ id: canvasId, workspaceId, name: "QA page", backgroundType: "grid", backgroundSpacing: 24, position: 0, deletedAt: null, createdAt: at, updatedAt: at }],
    elements: [{ id: crypto.randomUUID(), canvasId, type: "text", x: 100000, y: -100000, width: 400, height: 120,
      rotation: 17, zIndex: 1, sourceId: null, groupId: null, createdBy: users[0].id, updatedAt: at,
      content: { text: "Public QA text", lines: [{ id: "qa-line", t: "p", text: "Public QA text" }], layout: { col: 0, span: 24, key: 1 } }, style: {} }],
    sources: [], publications: [{ canvasId, workspaceId, slug: "qa_public_" + crypto.randomUUID().replaceAll("-", ""), isActive: true, publishedAt: at }],
  };
  const user = users.find(user => user.displayName === role)!;
  return { db, user, workspaceId, canvasId, path: `/app/w/${workspaceId}/p/${canvasId}`, slug: db.publications![0].slug };
}

export async function seed(page: Page, data = fixture()) {
  await page.goto("/");
  await page.evaluate(({ db, user }) => {
    localStorage.setItem("nexora:db", JSON.stringify(db));
    localStorage.setItem("nexora:session", user.id);
  }, data);
  return data;
}

export async function openEditor(page: Page, data = fixture()) {
  await seed(page, data);
  await page.goto(data.path);
  await expect(page.locator("[data-wid]").first()).toBeVisible();
  return data;
}

export async function saved(page: Page) {
  await expect(page.getByTitle("Всё сохранено", { exact: true })).toBeVisible();
}
