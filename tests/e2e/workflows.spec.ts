import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixture, openEditor, saved } from "./fixtures";

test("registration signs in and creates a notebook without requiring email proof", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Имя", { exact: true }).fill("QA user");
  await page.getByLabel("E-mail", { exact: true }).fill(`qa-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("Test-QA-Only-123!");
  await page.getByRole("button", { name: "Зарегистрироваться", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои тетради" })).toBeVisible();
  await page.getByRole("button", { name: "Новая тетрадь", exact: true }).first().click();
  await expect(page.getByLabel("Название страницы", { exact: true })).toBeVisible();
});

test("editing survives autosave, page navigation and reload at large coordinates", async ({ page }) => {
  const data = await openEditor(page);
  await page.locator("[data-lid]").first().fill("Saved browser regression text");
  await saved(page);
  await page.getByRole("button", { name: "Новая страница", exact: true }).first().click();
  await expect(page).not.toHaveURL(data.path);
  await page.goto(data.path);
  await expect(page.locator("[data-lid]").first()).toContainText("Saved browser regression text");
  await page.reload();
  await expect(page.locator("[data-lid]").first()).toContainText("Saved browser regression text");
  const element = await page.evaluate(id => {
    const db = JSON.parse(localStorage.getItem("nexora:db")!);
    return db.elements.find((el: { id: string }) => el.id === id);
  }, data.db.elements[0].id);
  expect([element.x, element.y, element.rotation]).toEqual([100000, -100000, 17]);
});

test("failed persistence shows an error and retry retains the edited text", async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "nexora:db" && sessionStorage.getItem("qa:fail-save") === "yes") throw new DOMException("QA simulated persistence failure", "QuotaExceededError");
      return original.call(this, key, value);
    };
    sessionStorage.setItem("qa:fail-save", "yes");
  });
  await page.locator("[data-lid]").first().fill("Kept while storage fails");
  const retry = page.getByRole("button", { name: /Не сохранено/ });
  await expect(retry).toBeVisible();
  await expect(page.locator("[data-lid]").first()).toContainText("Kept while storage fails");
  await page.evaluate(() => sessionStorage.removeItem("qa:fail-save"));
  await retry.click();
  await saved(page);
  await page.reload();
  await expect(page.locator("[data-lid]").first()).toContainText("Kept while storage fails");
});

test("viewer cannot edit or create pages", async ({ page }) => {
  const data = await openEditor(page, fixture("viewer"));
  await expect(page.locator("textarea:not([readonly]), [contenteditable]:not([contenteditable=false]), [data-handle]")).toHaveCount(0);
  await expect(page.getByLabel("Название страницы", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Новая страница", exact: true })).toHaveCount(0);
  await page.keyboard.press("Control+z");
  const els = await page.evaluate(() => JSON.parse(localStorage.getItem("nexora:db")!).elements);
  expect(els).toEqual(data.db.elements);
});

test("widget duplicate and delete support undo through the actual menu", async ({ page }) => {
  await openEditor(page);
  await page.locator("[data-handle]").first().click();
  await page.getByRole("option", { name: /Дублировать/ }).click();
  await expect(page.locator("[data-wid]")).toHaveCount(2);
  await page.locator("[data-handle]").last().click();
  await page.getByRole("option", { name: /Удалить/ }).click();
  await expect(page.locator("[data-wid]")).toHaveCount(1);
  await page.getByRole("button", { name: /^Отменить/ }).click();
  await expect(page.locator("[data-wid]")).toHaveCount(2);
  await saved(page);
  await page.reload();
  await expect(page.locator("[data-wid]")).toHaveCount(2);
});

test("JSON, PNG and PDF exports contain usable data", async ({ page }, info) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Экспорт: PNG, PDF, JSON", exact: true }).click();
  for (const [label, ext] of [["JSON-копия страницы", "json"], ["Скачать PNG", "png"], ["Скачать PDF", "pdf"]]) {
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
    const target = info.outputPath(`export.${ext}`);
    await file.saveAs(target);
    const bytes = await readFile(target);
    if (ext === "json") expect(JSON.parse(bytes.toString()).elements.length).toBeGreaterThan(0);
    else if (ext === "png") expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    else expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  }
});
