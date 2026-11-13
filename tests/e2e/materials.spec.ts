import { test, expect } from "@playwright/test";
import path from "node:path";
import { openEditor } from "./fixtures";

test("PDF, PPTX and image fixtures upload and retain original filenames", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Материалы и ИИ", exact: true }).click();
  await page.locator('input[type="file"][accept^=".pdf"]').setInputFiles([
    path.resolve("tests/fixtures/lecture-12-pages.pdf"),
    path.resolve("tests/fixtures/lecture-12-slides.pptx"),
    path.resolve("tests/fixtures/sample-red.png"),
  ]);
  await expect(page.getByText("lecture-12-pages.pdf", { exact: true })).toBeVisible();
  await expect(page.getByText("lecture-12-slides.pptx", { exact: true })).toBeVisible();
  await expect(page.getByText("sample-red.png", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nexora:db")!).sources.length)).toBe(3);
});

test("oversized and executable files are rejected without partial persistence", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Материалы и ИИ", exact: true }).click();
  const input = page.locator('input[type="file"][accept^=".pdf"]');
  await input.setInputFiles({ name: "too-big.txt", mimeType: "text/plain", buffer: Buffer.alloc(25 * 1024 * 1024 + 1, 65) });
  await expect(page.getByRole("alert").filter({ hasText: /25/ })).toBeVisible();
  await input.setInputFiles({ name: "program.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await expect(page.getByRole("alert").filter({ hasText: /Формат не поддерживается/ })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nexora:db")!).sources)).toEqual([]);
});

test("assistant keeps its draft while editing without a configured provider", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Материалы и ИИ", exact: true }).click();
  await page.getByRole("button", { name: "Помощник", exact: true }).click();
  await page.getByLabel("Вопрос помощнику", { exact: true }).fill("Explain the selected paragraph");
  await expect(page.getByLabel("Вопрос помощнику", { exact: true })).toHaveValue("Explain the selected paragraph");
  await page.locator("[data-lid]").first().fill("Editor works without a paid provider");
  await expect(page.locator("[data-lid]").first()).toContainText("Editor works without a paid provider");
});
