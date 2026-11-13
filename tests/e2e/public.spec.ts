import { test, expect } from "@playwright/test";
import { fixture, seed } from "./fixtures";

test("landing, protected routes and security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  await expect(page.locator("h1")).toBeVisible();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/p/invalid");
  await expect(page.getByText("404", { exact: true })).toBeVisible();
});

test("anonymous public viewer supports pan and zoom without page overflow", async ({ page }) => {
  const data = fixture();
  data.db.elements[0].content.text = "Public QA text\n".repeat(60);
  await seed(page, data);
  await page.evaluate(() => localStorage.removeItem("nexora:session"));
  const response = await page.goto(`/p/${data.slug}`);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.getByRole("heading", { name: "QA page" })).toBeVisible();
  await expect(page.getByText("Только просмотр", { exact: true })).toBeAttached();
  await expect(page.locator("[contenteditable]:not([contenteditable=false]),input,textarea")).toHaveCount(0);
  await page.getByRole("button", { name: "Увеличить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сбросить масштаб" })).toHaveText("125%");
  const viewer = page.getByLabel("Страница «QA page»", { exact: true });
  await viewer.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => viewer.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "К началу страницы" }).click();
  await expect(page.getByRole("button", { name: "Сбросить масштаб" })).toHaveText("100%");
});

test("disabled publication and deleted notebook deny anonymous access", async ({ page }) => {
  const data = fixture();
  data.db.publications![0].isActive = false;
  await seed(page, data);
  await page.goto(`/p/${data.slug}`);
  await expect(page.getByText("Ссылка не активна")).toBeVisible();
  data.db.publications![0].isActive = true;
  data.db.workspaces[0].deletedAt = new Date().toISOString();
  await seed(page, data);
  await page.goto(`/p/${data.slug}`);
  await expect(page.getByText("Ссылка не активна")).toBeVisible();
});
