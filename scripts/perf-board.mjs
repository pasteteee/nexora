#!/usr/bin/env node
/**
 * Замер редактора на странице со 100+ виджетами (карточка #42, критерий ТЗ 22).
 * Работает в демо-режиме: кладёт тетрадь в localStorage и открывает её в Chromium.
 *
 *   npm run build && npx next start -p 3100   # без переменных Supabase
 *   node scripts/perf-board.mjs [--url http://localhost:3100] [--count 120] [--cpu 4]
 *
 * Меряет кадры при прокрутке и перетаскивании виджета, а также задержку
 * от нажатия клавиши в тексте до следующего кадра. Порог ТЗ: не больше 2
 * пропущенных кадров подряд при 60 Гц и средний отклик не больше 200 мс.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

// Playwright может стоять глобально, а не в зависимостях проекта.
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(`${execSync("npm root -g").toString().trim()}/playwright`); }
const { chromium } = pw;

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const URL = arg("url", "http://localhost:3100");
const COUNT = Number(arg("count", "120"));
const CPU = Number(arg("cpu", "1"));
const FRAME = 1000 / 60;

const uuid = () => crypto.randomUUID();
const at = new Date().toISOString();

function seed(count) {
  const user = { id: uuid(), email: "perf@example.com", displayName: "Замер", emailVerified: true, passHash: "-", confirmed: true };
  const ws = { id: uuid(), ownerId: user.id, name: "Замер 100+", createdAt: at, updatedAt: at, deletedAt: null };
  const canvas = { id: uuid(), workspaceId: ws.id, name: "Страница", backgroundType: "plain", backgroundSpacing: 24, position: 0, deletedAt: null, createdAt: at, updatedAt: at };
  const kinds = ["text", "text", "text", "formula", "note", "kanban", "table", "checklist", "plot", "diagram", "code", "flash", "quiz", "deadlines", "timer", "text"];
  const spans = { text: 24, formula: 12, note: 8, kanban: 16, table: 12, checklist: 8, plot: 10, diagram: 16, code: 12, flash: 8, quiz: 8, deadlines: 8, timer: 6 };
  const elements = [];
  let col = 0;
  for (let i = 0; i < count; i++) {
    const k = kinds[i % kinds.length], span = spans[k];
    if (col + span > 24) col = 0;
    const layout = { col, span, key: i + 1 };
    col = (col + span) % 24;
    const base = { id: uuid(), canvasId: canvas.id, x: 0, y: 0, width: 400, height: 120, rotation: 0, zIndex: i + 1, sourceId: null, groupId: null, createdBy: user.id, updatedAt: at };
    if (k === "text") {
      const lines = [{ id: `h${i}`, t: "h2", text: `Раздел ${i}` }, { id: `p${i}`, t: "p", text: "Конспект лекции: определение, свойства и пример. ".repeat(3) }, { id: `l${i}`, t: "li", text: "Пункт списка" }];
      elements.push({ ...base, type: "text", content: { lines, text: "", layout }, style: {} });
    } else if (k === "formula") elements.push({ ...base, type: "formula", content: { src: "x^2 + y^2 = r^2", latex: "x^2 + y^2 = r^2", layout }, style: {} });
    else if (k === "note") elements.push({ ...base, type: "note", content: { text: `Заметка ${i}`, layout }, style: { color: "yellow", fontSize: 16 } });
    else elements.push({ ...base, type: "note", content: { widget: k, text: k, layout }, style: { color: "gray", fontSize: 16 } });
  }
  const db = { users: [user], tokens: {}, workspaces: [ws], members: [{ workspaceId: ws.id, userId: user.id, role: "owner" }], canvases: [canvas], elements, sources: [] };
  return { db, user, ws, canvas };
}

/** Кадры, записанные в странице через requestAnimationFrame. */
const startFrames = () => {
  window.__frames = []; let last = performance.now();
  const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__rec) requestAnimationFrame(tick); };
  window.__rec = true; requestAnimationFrame(tick);
};
const stopFrames = () => { window.__rec = false; return window.__frames.slice(1); };

function report(name, deltas) {
  let worstRun = 0, dropped = 0;
  for (const d of deltas) { const miss = Math.max(0, Math.round(d / FRAME) - 1); dropped += miss; worstRun = Math.max(worstRun, miss); }
  const sorted = [...deltas].sort((a, b) => a - b), p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const r = { name, frames: deltas.length, dropped, worstRun, p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), max: +(sorted.at(-1) ?? 0).toFixed(1) };
  console.log(`${name.padEnd(12)} кадров ${String(r.frames).padStart(4)}  пропущено ${String(dropped).padStart(3)}  подряд максимум ${worstRun}  p50 ${r.p50} мс  p95 ${r.p95} мс  max ${r.max} мс`);
  return r;
}

const { db, user, ws, canvas } = seed(COUNT);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.error("Ошибка на странице:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("Консоль:", m.text().slice(0, 500)); });
await page.goto(`${URL}/`);
await page.evaluate(([d, id]) => { localStorage.setItem("nexora:db", JSON.stringify(d)); localStorage.setItem("nexora:session", id); }, [db, user.id]);
const cdp = await page.context().newCDPSession(page);
if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

const t0 = Date.now();
await page.goto(`${URL}/app/w/${ws.id}/p/${canvas.id}`);
await page.waitForFunction((n) => document.querySelectorAll("[data-wid]").length >= n, COUNT, { timeout: 60_000 }).catch(async (e) => {
  console.error(`Страница не открылась: ${page.url()}\n${(await page.innerText("body")).slice(0, 400)}`);
  throw e;
});
console.log(`Виджетов: ${COUNT}, CPU x${CPU}. Страница готова за ${Date.now() - t0} мс`);
await page.waitForTimeout(800);

const results = [];
// 1. Прокрутка страницы колесом (аналог pan)
await page.mouse.move(720, 500);
await page.evaluate(startFrames);
for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(16); }
for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(16); }
results.push(report("прокрутка", await page.evaluate(stopFrames)));

// 2. Перетаскивание виджета за ручку через всю видимую область
const target = page.locator("[data-wid]").nth(4);
await target.scrollIntoViewIfNeeded();
await target.hover();
const h = await target.locator("[data-handle]").boundingBox();
await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
await page.mouse.down();
await cdp.send("Performance.enable");
const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const tracing = process.argv.includes("--trace");
if (tracing) await browser.startTracing(page, { path: "perf-trace.json", screenshots: false });
await page.evaluate(startFrames);
for (let i = 0; i < 120; i++) {
  await page.mouse.move(h.x + 10 + (i % 60) * 12, h.y + 20 + Math.sin(i / 10) * 260);
  await page.waitForTimeout(16);
}
const dragFrames = await page.evaluate(stopFrames);
if (tracing) await browser.stopTracing();
const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
if (process.argv.includes("--metrics")) for (const k of ["ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "TaskDuration", "LayoutCount", "RecalcStyleCount"])
  console.log(`  ${k}: ${(m1[k] - m0[k]).toFixed(3)}`);
await page.mouse.up();
results.push(report("перетаскивание", dragFrames));
if (process.argv.includes("--metrics")) { let t = 0; console.log("  долгие кадры:", dragFrames.map((d) => [Math.round(t += d), Math.round(d)]).filter(([, d]) => d > 50).map(([at, d]) => `${d} мс на ${at} мс`).join(", ")); }
await page.waitForTimeout(600);

// 3. Отклик на ввод: от нажатия клавиши до следующего кадра
const field = page.locator("[data-type=text] textarea").first();
await field.scrollIntoViewIfNeeded();
await field.click();
const lat = [];
for (let i = 0; i < 30; i++) {
  await page.evaluate(() => { window.__k = 0; document.addEventListener("beforeinput", () => { window.__k = performance.now(); }, { once: true, capture: true }); });
  await page.keyboard.type("а");
  lat.push(await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(() => r(performance.now() - window.__k), 0)))));
}
const avg = lat.reduce((a, b) => a + b, 0) / lat.length;
console.log(`ввод        средний отклик ${avg.toFixed(1)} мс, худший ${Math.max(...lat).toFixed(1)} мс`);

await browser.close();
const ok = results.every((r) => r.worstRun <= 2) && avg <= 200;
console.log(ok ? "Итог: в пределах критерия 22" : "Итог: критерий 22 не выполнен");
process.exit(ok ? 0 : 1);
