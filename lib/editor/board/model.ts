import type { CanvasElement } from "@/lib/types";
import { toTex } from "./math";

/**
 * Page of widgets on a 24-column grid. Every widget is one page element, so autosave, history,
 * realtime, search and publishing keep working without a schema change:
 *  - text, formula, image, source and source_fragment keep their element types;
 *  - every other widget is a `note` element with `content.widget` and `content.data`;
 *  - placement lives in `content.layout` ({ col, span, key }); `key` orders widgets for packing.
 * `content.text` always carries a Markdown summary for search, export and the public page.
 */
export const COLS = 24, GAP = 16, MIN_SPAN = 4, NARROW = 680;

export type LineType = "p" | "h1" | "h2" | "h3" | "li" | "ol" | "todo" | "quote" | "math";
export type Line = { id: string; t: LineType; text?: string; src?: string; done?: boolean };
export type WidgetType = "text" | "formula" | "note" | "diagram" | "image" | "source" | "fragment" | "plot" | "kanban" | "table" | "checklist" | "flash" | "quiz" | "deadlines" | "timer" | "callout" | "code" | "toc";
export type Layout = { col: number; span: number; key: number };

export type KanbanCard = { id: string; text: string };
export type KanbanCol = { id: string; title: string; cards: KanbanCard[] };
export type DiagramShape = "node" | "rect" | "ellipse" | "rhombus" | "triangle";
export type DiagramNode = { id: string; kind: DiagramShape; cx: number; cy: number; label: string; color?: NoteColor };
export type NoteColor = "yellow" | "pink" | "green" | "blue" | "violet" | "gray";
export const NOTE_COLORS: [NoteColor, string][] = [["yellow", "Жёлтый"], ["pink", "Розовый"], ["green", "Зелёный"], ["blue", "Голубой"], ["violet", "Сиреневый"], ["gray", "Серый"]];
export const TEXT_LIMIT = 20000, NOTE_LIMIT = 500;

export type WidgetData = {
  diagram: { h: number; nodes: DiagramNode[]; edges: { id: string; from: string; to: string }[] };
  plot: { f1: string; f2: string; xmin: number; xmax: number };
  kanban: { title: string; cols: KanbanCol[] };
  table: { rows: string[][] };
  checklist: { title: string; items: { id: string; text: string; done: boolean }[] };
  flash: { cards: { q: string; a: string }[]; i: number };
  quiz: { q: string; opts: string[]; right: number };
  deadlines: { items: { id: string; title: string; date: string }[] };
  timer: { work: number; rest: number };
  callout: { text: string; tone: "info" | "warn" | "ok" };
  code: { lang: string; code: string };
  toc: Record<string, never>;
};
export type NoteWidget = keyof WidgetData;
export const NOTE_WIDGETS: NoteWidget[] = ["diagram", "plot", "kanban", "table", "checklist", "flash", "quiz", "deadlines", "timer", "callout", "code", "toc"];

export type Widget = { id: string; type: WidgetType; layout: Layout; el: CanvasElement };

export const uid = () => Math.random().toString(36).slice(2, 10);
export const randomIn = (a: number, b: number) => a + Math.random() * (b - a);

export type CatalogItem = { t: WidgetType; name: string; ico: string; about: string; g: string };
export const CATALOG: CatalogItem[] = [
  { t: "text", name: "Текст", ico: "Т", about: "Абзацы, заголовки, списки, до 20 000 знаков", g: "Объекты" },
  { t: "formula", name: "Формула", ico: "∑", about: "Как в калькуляторе или LaTeX, ошибка видна", g: "Объекты" },
  { t: "note", name: "Заметка", ico: "▤", about: "Стикер, 6 цветов, до 500 знаков", g: "Объекты" },
  { t: "diagram", name: "Схема", ico: "◇", about: "Узлы, фигуры и стрелки между ними", g: "Объекты" },
  { t: "image", name: "Картинка", ico: "▣", about: "PNG, JPEG, WebP до 25 МиБ", g: "Объекты" },
  { t: "source", name: "Материал", ico: "⎘", about: "PDF, PPTX, TXT, MD со статусом обработки", g: "Объекты" },
  { t: "fragment", name: "Фрагмент", ico: "❝", about: "Цитата из материала со страницей", g: "Объекты" },
  { t: "plot", name: "График", ico: "∿", about: "Строит y = f(x) по формуле", g: "Для учёбы" },
  { t: "table", name: "Таблица", ico: "▦", about: "Ячейки, строки и столбцы", g: "Для учёбы" },
  { t: "flash", name: "Карточки", ico: "⇆", about: "Вопрос и ответ для повторения", g: "Для учёбы" },
  { t: "quiz", name: "Самопроверка", ico: "?", about: "Вопрос с вариантами ответа", g: "Для учёбы" },
  { t: "checklist", name: "Чек-лист", ico: "☑", about: "Список дел с прогрессом", g: "Планирование" },
  { t: "kanban", name: "Канбан", ico: "▥", about: "Задачи по колонкам, перетаскиваются", g: "Планирование" },
  { t: "deadlines", name: "Дедлайны", ico: "◷", about: "Сроки и сколько дней осталось", g: "Планирование" },
  { t: "timer", name: "Таймер", ico: "◔", about: "Помодоро 25 и 5 минут", g: "Планирование" },
  { t: "code", name: "Код", ico: "{}", about: "Фрагмент кода моноширинным", g: "Ещё" },
  { t: "toc", name: "Оглавление", ico: "≡", about: "Собирается из заголовков", g: "Ещё" },
];
/** Callout stays renderable for pages made with the first prototype; the note took its place in the catalog. */
export const CATALOG_BY_TYPE: Record<string, CatalogItem> = Object.fromEntries([...CATALOG, { t: "callout", name: "Выноска", ico: "!", about: "Важная мысль цветом", g: "Ещё" } as CatalogItem].map((c) => [c.t, c]));

export const DEFAULT_SPAN: Record<WidgetType, number> = { text: 24, formula: 12, note: 8, diagram: 16, image: 10, source: 8, fragment: 12, plot: 10, kanban: 16, table: 12, checklist: 8, flash: 8, quiz: 8, deadlines: 8, timer: 6, callout: 12, code: 12, toc: 6 };

export function defaultData<T extends NoteWidget>(t: T): WidgetData[T] {
  const d: { [K in NoteWidget]: () => WidgetData[K] } = {
    diagram: () => {
      const a = uid(), b = uid();
      return { h: 260, nodes: [{ id: a, kind: "node", cx: 0.3, cy: 120, label: "Идея" }, { id: b, kind: "node", cx: 0.7, cy: 120, label: "Следствие" }], edges: [{ id: uid(), from: a, to: b }] };
    },
    plot: () => ({ f1: "x^2", f2: "", xmin: -3, xmax: 3 }),
    kanban: () => ({ title: "Доска", cols: [{ id: uid(), title: "Надо", cards: [] }, { id: uid(), title: "В работе", cards: [] }, { id: uid(), title: "Готово", cards: [] }] }),
    table: () => ({ rows: [["", "", ""], ["", "", ""], ["", "", ""]] }),
    checklist: () => ({ title: "Чек-лист", items: [{ id: uid(), text: "", done: false }] }),
    flash: () => ({ cards: [{ q: "Вопрос", a: "Ответ" }], i: 0 }),
    quiz: () => ({ q: "Вопрос", opts: ["Верный ответ", "Неверный ответ"], right: 0 }),
    deadlines: () => ({ items: [] }),
    timer: () => ({ work: 25, rest: 5 }),
    callout: () => ({ text: "", tone: "info" }),
    code: () => ({ lang: "Python", code: "" }),
    toc: () => ({}),
  };
  return d[t]();
}

/* ---------------- text lines <-> Markdown ---------------- */
const PREFIX: Record<Exclude<LineType, "math" | "todo">, string> = { p: "", h1: "# ", h2: "## ", h3: "### ", li: "- ", ol: "1. ", quote: "> " };

export function linesToMarkdown(lines: Line[]): string {
  return lines.map((l) => {
    if (l.t === "math") return `$$${toTex(l.src ?? "")}$$`;
    if (l.t === "todo") return `- [${l.done ? "x" : " "}] ${l.text ?? ""}`;
    return PREFIX[l.t] + (l.text ?? "");
  }).join("\n");
}

/** Plain lines from older Markdown text blocks: one line per row, block syntax becomes the line type. */
export function markdownToLines(md: string): Line[] {
  const rows = String(md ?? "").replace(/\r/g, "").split("\n");
  const out: Line[] = rows.map((row) => {
    const id = uid();
    let m: RegExpMatchArray | null;
    if ((m = row.match(/^\$\$(.*)\$\$\s*$/))) return { id, t: "math", src: m[1].trim() };
    if ((m = row.match(/^[-*] \[([ xX])\] (.*)$/))) return { id, t: "todo", text: m[2], done: m[1] !== " " };
    if ((m = row.match(/^(#{1,3}) (.*)$/))) return { id, t: (`h${m[1].length}`) as LineType, text: m[2] };
    if ((m = row.match(/^[-*] (.*)$/))) return { id, t: "li", text: m[1] };
    if ((m = row.match(/^\d+[.)] (.*)$/))) return { id, t: "ol", text: m[1] };
    if ((m = row.match(/^> ?(.*)$/))) return { id, t: "quote", text: m[1] };
    return { id, t: "p", text: row };
  });
  return out.length ? out : [{ id: uid(), t: "p", text: "" }];
}

export function linesOf(el: CanvasElement): Line[] {
  const raw = el.content.lines;
  if (Array.isArray(raw) && raw.length) return raw as Line[];
  return markdownToLines(String(el.content.text ?? ""));
}

/** Markdown typed at the start of a line turns into a block type. */
export const MD_SHORTCUTS: [RegExp, LineType][] = [[/^#\s$/, "h1"], [/^##\s$/, "h2"], [/^###\s$/, "h3"], [/^[-*]\s$/, "li"], [/^1[.)]\s$/, "ol"], [/^\[\]\s$/, "todo"], [/^>\s$/, "quote"], [/^=\s$/, "math"]];
export const LINE_TYPES: { t: LineType; label: string; ico: string; k: string; hint?: string }[] = [
  { t: "p", label: "Текст", ico: "Т", k: "текст" },
  { t: "h1", label: "Заголовок 1", ico: "H1", k: "заголовок #", hint: "#" },
  { t: "h2", label: "Заголовок 2", ico: "H2", k: "заголовок ##", hint: "##" },
  { t: "h3", label: "Заголовок 3", ico: "H3", k: "заголовок ###", hint: "###" },
  { t: "li", label: "Список", ico: "•", k: "список -", hint: "-" },
  { t: "ol", label: "Нумерованный список", ico: "1.", k: "нумерованный 1.", hint: "1." },
  { t: "todo", label: "Задача", ico: "☐", k: "задача todo", hint: "[]" },
  { t: "quote", label: "Цитата", ico: "”", k: "цитата >", hint: ">" },
  { t: "math", label: "Формула", ico: "∑", k: "формула math =", hint: "=" },
];
export const LINE_PLACEHOLDER: Record<LineType, string> = { p: "Пишите или нажмите / для блоков и виджетов", h1: "Заголовок", h2: "Заголовок раздела", h3: "Подзаголовок", li: "Пункт списка", ol: "Пункт списка", todo: "Задача", quote: "Цитата", math: "" };

/* ---------------- element <-> widget ---------------- */
const TEXT_TYPES = new Set(["text", "shape", "diagram_node"]);

export function widgetType(el: CanvasElement): WidgetType | null {
  if (TEXT_TYPES.has(el.type)) return "text";
  if (el.type === "formula") return "formula";
  if (el.type === "image") return "image";
  if (el.type === "source") return "source";
  if (el.type === "source_fragment") return "fragment";
  if (el.type === "note") {
    const w = el.content.widget;
    return typeof w === "string" && (NOTE_WIDGETS as string[]).includes(w) ? (w as WidgetType) : "note";
  }
  return null; // connectors and groups have no place on a page of widgets
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function layoutOf(el: CanvasElement, type: WidgetType): Layout | null {
  const l = el.content.layout as Partial<Layout> | undefined;
  if (l && finite(l.col) && finite(l.span) && finite(l.key)) {
    const span = Math.max(MIN_SPAN, Math.min(COLS, Math.round(l.span)));
    return { span, col: Math.max(0, Math.min(COLS - span, Math.round(l.col))), key: l.key };
  }
  void type;
  return null;
}

/** Widgets of a page. Elements without a layout (older pages, new uploads and AI answers) go below, in their old order. */
export function pageWidgets(els: Record<string, CanvasElement>): Widget[] {
  const list: Widget[] = [], legacy: { el: CanvasElement; type: WidgetType }[] = [];
  for (const el of Object.values(els)) {
    const type = widgetType(el);
    if (!type) continue;
    const layout = layoutOf(el, type);
    if (layout) list.push({ id: el.id, type, layout, el }); else legacy.push({ el, type });
  }
  const order = (el: CanvasElement) => (finite(el.content.documentOrder) ? el.content.documentOrder : Number.MAX_SAFE_INTEGER);
  legacy.sort((a, b) => order(a.el) - order(b.el) || a.el.y - b.el.y || a.el.x - b.el.x || a.el.id.localeCompare(b.el.id));
  let key = list.reduce((m, w) => Math.max(m, w.layout.key), 0) + 1e6;
  for (const { el, type } of legacy) list.push({ id: el.id, type, el, layout: { col: 0, span: type === "text" ? COLS : Math.max(DEFAULT_SPAN[type], 12), key: key++ } });
  return list.sort((a, b) => a.layout.key - b.layout.key || a.layout.col - b.layout.col || a.id.localeCompare(b.id));
}

export function dataOf<T extends NoteWidget>(el: CanvasElement, t: T): WidgetData[T] {
  const d = el.content.data as WidgetData[T] | undefined;
  if (d && typeof d === "object") return d;
  if (t === "callout") return { text: String(el.content.text ?? ""), tone: "info" } as WidgetData[T];
  return defaultData(t);
}

/* ---------------- Markdown summaries for search, export and the public page ---------------- */
export function summary(t: NoteWidget, d: WidgetData[NoteWidget]): string {
  switch (t) {
    case "diagram": { const g = d as WidgetData["diagram"]; const name = (id: string) => g.nodes.find((n) => n.id === id)?.label || "узел"; return ["**Схема**", ...g.nodes.map((n) => `- ${n.label || "узел"}`), ...g.edges.map((e) => `- ${name(e.from)} → ${name(e.to)}`)].join("\n"); }
    case "plot": { const p = d as WidgetData["plot"]; return `**График:** y = ${p.f1}${p.f2 ? `, y = ${p.f2}` : ""} (x от ${p.xmin} до ${p.xmax})`; }
    case "kanban": { const k = d as WidgetData["kanban"]; return [`**${k.title || "Доска"}**`, ...k.cols.map((c) => [`\n**${c.title}**`, ...c.cards.map((x) => `- ${x.text}`)].join("\n"))].join("\n"); }
    case "table": { const r = (d as WidgetData["table"]).rows; return r.map((row) => row.join(" | ")).join("\n"); }
    case "checklist": { const c = d as WidgetData["checklist"]; return [`**${c.title}**`, ...c.items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`)].join("\n"); }
    case "flash": return (d as WidgetData["flash"]).cards.map((c) => `**${c.q}** — ${c.a}`).join("\n");
    case "quiz": { const q = d as WidgetData["quiz"]; return [`**${q.q}**`, ...q.opts.map((o) => `- ${o}`)].join("\n"); }
    case "deadlines": return (d as WidgetData["deadlines"]).items.map((i) => `- ${i.date}: ${i.title}`).join("\n") || "**Дедлайны**";
    case "timer": { const m = d as WidgetData["timer"]; return `**Таймер:** ${m.work} мин работы, ${m.rest} мин перерыва`; }
    case "callout": return (d as WidgetData["callout"]).text;
    case "code": { const c = d as WidgetData["code"]; return "```" + c.lang.toLowerCase() + "\n" + c.code + "\n```"; }
    case "toc": return "**Содержание**";
  }
}

/* ---------------- packing with gravity ---------------- */
export type PackItem = { id: string; col: number; span: number; key: number; h: number };
/** Items in order of their key, each as high as possible without overlapping columns already placed. */
export function pack<T extends PackItem>(items: T[], gap = GAP): (T & { top: number })[] {
  const placed: (T & { top: number })[] = [];
  for (const it of [...items].sort((a, b) => a.key - b.key || a.col - b.col)) {
    let top = 0;
    for (const p of placed) if (it.col < p.col + p.span && p.col < it.col + it.span) top = Math.max(top, p.top + p.h + gap);
    placed.push({ ...it, top });
  }
  return placed;
}

export function plural(n: number): string {
  n = Math.abs(n) % 100; const n1 = n % 10;
  if (n > 10 && n < 20) return "дней";
  if (n1 > 1 && n1 < 5) return "дня";
  if (n1 === 1) return "день";
  return "дней";
}
