#!/usr/bin/env node
/**
 * Проверка доступности (карточка #41): axe-core на основных экранах в светлой и тёмной теме,
 * во всех темах тетради и с prefers-reduced-motion. Открывает с клавиатуры меню и диалоги редактора и проверяет их тоже. Работает в демо-режиме, как perf-board.mjs.
 *
 *   npm run build && npx next start -p 3100   # без переменных Supabase
 *   node scripts/a11y-audit.mjs [--url http://localhost:3100] [--all]
 *
 * Код выхода 1, если есть нарушения уровня serious или critical. С --all печатает и moderate/minor.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(`${execSync("npm root -g").toString().trim()}/playwright`); }
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const URL = arg("url", "http://localhost:3100");
const ALL = process.argv.includes("--all");
const at = new Date().toISOString(), uuid = () => crypto.randomUUID();

const user = { id: uuid(), email: "a11y@example.com", displayName: "Проверка", emailVerified: true, passHash: "-", confirmed: true };
const ws = { id: uuid(), ownerId: user.id, name: "Доступность", createdAt: at, updatedAt: at, deletedAt: null };
const canvas = { id: uuid(), workspaceId: ws.id, name: "Все виджеты", backgroundType: "plain", backgroundSpacing: 24, position: 0, deletedAt: null, createdAt: at, updatedAt: at };
const kinds = ["text", "formula", "note", "diagram", "plot", "table", "flash", "quiz", "checklist", "kanban", "deadlines", "timer", "code", "toc", "callout"];
const elements = kinds.map((k, i) => {
  const layout = { col: 0, span: k === "text" ? 24 : 12, key: i + 1 };
  const base = { id: uuid(), canvasId: canvas.id, x: 0, y: 0, width: 400, height: 120, rotation: 0, zIndex: i + 1, sourceId: null, groupId: null, createdBy: user.id, updatedAt: at, style: {} };
  if (k === "text") return { ...base, type: "text", content: { lines: [{ id: "h", t: "h1", text: "Конспект" }, { id: "p", t: "p", text: "Абзац текста" }, { id: "t", t: "todo", text: "Задача", done: false }], text: "", layout } };
  if (k === "formula") return { ...base, type: "formula", content: { src: "x^2", latex: "x^2", layout } };
  if (k === "note") return { ...base, type: "note", content: { text: "Заметка", layout }, style: { color: "yellow" } };
  return { ...base, type: "note", content: { widget: k, text: k, layout }, style: { color: "gray" } };
});
const slug = "a11y-" + uuid().slice(0, 8);
const db = {
  users: [user], tokens: {}, workspaces: [ws], members: [{ workspaceId: ws.id, userId: user.id, role: "owner" }], canvases: [canvas], elements, sources: [],
  invitations: [], publications: [{ canvasId: canvas.id, workspaceId: ws.id, slug, isActive: true, publishedAt: at }],
};

const editor = `/app/w/${ws.id}/p/${canvas.id}`;
const screens = [
  { name: "Лендинг", path: "/", auth: false },
  { name: "Вход", path: "/login", auth: false },
  { name: "Мои тетради", path: "/app" },
  { name: "Редактор", path: editor, ready: "[data-wid]" },
  { name: "Редактор, тёмная", path: editor, ready: "[data-wid]", scheme: "dark" },
  ...["grid", "lined", "dots", "kraft", "night", "board"].map((theme) => ({ name: `Редактор, тема ${theme}`, path: editor, ready: "[data-wid]", theme })),
  { name: "Публичная страница", path: `/p/${slug}`, auth: false },
  { name: "Публичная, телефон", path: `/p/${slug}`, auth: false, mobile: true },
  { name: "Профиль", path: "/app/profile" },
];

const browser = await pw.chromium.launch();
let serious = 0;

async function audit(page, name, skip = []) {
  const res = await page.evaluate((off) => window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: Object.fromEntries(off.map((r) => [r, { enabled: false }])),
  }), skip);
  const shown = res.violations.filter((v) => ALL || v.impact === "serious" || v.impact === "critical");
  serious += res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").length;
  console.log(`\n${name}: ${shown.length ? "" : "нарушений нет"}`);
  for (const v of shown) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} шт.`);
    for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target.join(" ")}  ${(n.failureSummary ?? "").split("\n").slice(1, 2).join(" ").trim().slice(0, 160)}`);
  }
}

/** Состояния редактора, которые открываются с клавиатуры. */
const STATES = [
  ["меню виджета", async (p) => { await p.locator("[data-wid] [data-handle]").first().focus(); await p.keyboard.press("Enter"); }],
  ["галерея виджетов", async (p) => { await p.getByRole("button", { name: "+ Виджет" }).click(); }],
  ["меню «/» в тексте", async (p) => { const t = p.locator("[data-type=text] textarea").last(); await t.click(); await p.keyboard.press("End"); await p.keyboard.press("Enter"); await p.keyboard.type("/"); }],
  ["редактор формулы", async (p) => { await p.locator("[data-type=formula] [data-math]").first().click(); }],
  ["диалог «Поделиться»", async (p) => { await p.getByRole("button", { name: /Поделиться/ }).click(); }],
];
for (const sc of screens) {
  const ctx = await browser.newContext({ viewport: sc.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, colorScheme: sc.scheme ?? "light", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${URL}/login`);
  const theme = sc.theme;
  await page.evaluate(([d, id, auth, t]) => {
    const copy = structuredClone(d);
    if (t) copy.workspaces[0].theme = t;
    localStorage.setItem("nexora:db", JSON.stringify(copy));
    if (auth) localStorage.setItem("nexora:session", id); else localStorage.removeItem("nexora:session");
  }, [db, user.id, sc.auth !== false, theme]);
  await page.goto(`${URL}${sc.path}`);
  if (sc.ready) await page.waitForSelector(sc.ready, { timeout: 30_000 });
  await page.waitForTimeout(900);
  await page.addScriptTag({ content: AXE });
  await audit(page, sc.name);
  // Открытые меню и диалоги редактора: их нет в DOM, пока их не откроют.
  if (sc.path === editor && !sc.scheme && !sc.theme) {
    for (const [label, open] of STATES) {
      await open(page);
      await page.waitForTimeout(300);
      // Открытое меню закрывает часть страницы: target-size тогда считает перекрытые поля «маленькими».
      await audit(page, `${sc.name}: ${label}`, ["target-size"]);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(serious ? `\nИтог: ${serious} нарушений serious/critical` : "\nИтог: нарушений serious/critical нет");
process.exit(serious ? 1 : 0);
