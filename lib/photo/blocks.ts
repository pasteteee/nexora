/**
 * What a recognised photo turns into. The model answers with raw blocks (`RawBlock`), which are untrusted:
 * `normalizeBlocks` checks every field, bounds sizes and turns them into blocks the page can hold
 * (`PhotoBlock`): text with headings and lists, formulas in the calculator syntax of the formula widget,
 * plots of y = f(x) and tables. A plot whose function cannot be drawn becomes a table of its points.
 */
import { compileFn } from "@/lib/editor/board/math";

export type PhotoHint = "auto" | "text" | "formula" | "plot" | "table";
export const PHOTO_HINTS: [PhotoHint, string][] = [["auto", "Всё подряд"], ["text", "Текст"], ["formula", "Формулы"], ["plot", "График"], ["table", "Таблица"]];

export type RawBlock = {
  kind?: unknown; text?: unknown; level?: unknown; items?: unknown; ordered?: unknown;
  formula?: unknown; fn?: unknown; xmin?: unknown; xmax?: unknown; points?: unknown; rows?: unknown; title?: unknown;
};

export type PhotoBlock =
  | { id: string; kind: "text"; md: string }
  | { id: string; kind: "formula"; src: string }
  | { id: string; kind: "plot"; fn: string; xmin: number; xmax: number; title: string }
  | { id: string; kind: "table"; rows: string[][]; title: string };

export const BLOCK_LABEL: Record<PhotoBlock["kind"], string> = { text: "Текст", formula: "Формула", plot: "График", table: "Таблица" };

export const LIMITS = { blocks: 40, text: 6000, formula: 300, rows: 30, cols: 8, cell: 200 };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : NaN);
let seq = 0;
const bid = () => `pb${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Common LaTeX the model may still write, rewritten into the calculator syntax of the formula widget. */
export function latexToPlain(input: string): string {
  let s = String(input ?? "").trim().replace(/^\$+|\$+$/g, "").replace(/^\\\[|\\\]$/g, "").replace(/^\\\(|\\\)$/g, "").trim();
  if (!s.includes("\\")) return s;
  const group = String.raw`\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}`;
  const frac = new RegExp(String.raw`\\[dt]?frac\s*` + group + String.raw`\s*` + group);
  const sqrtN = new RegExp(String.raw`\\sqrt\s*\[([^\]]*)\]\s*` + group);
  const sqrt = new RegExp(String.raw`\\sqrt\s*` + group);
  for (let guard = 0; guard < 50; guard++) {
    const before = s;
    s = s.replace(frac, "($1)/($2)").replace(sqrtN, "root($1, $2)").replace(sqrt, "sqrt($1)")
      .replace(new RegExp(String.raw`\\(?:vec|overrightarrow)\s*` + group), "vec($1)")
      .replace(new RegExp(String.raw`\\(?:text|mathrm|mathbf|mathit|operatorname)\s*` + group), "$1");
    if (s === before) break;
  }
  s = s.replace(/\\left\s*\|/g, "|").replace(/\\right\s*\|/g, "|").replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*/g, "")
    .replace(/\\lim_\{([^}]*)\}/g, "lim($1) ").replace(/\\(sum|int|prod)_\{([^}]*)\}\^\{([^}]*)\}/g, "$1($2, $3) ").replace(/\\(sum|int|prod)_\{([^}]*)\}\^(\w)/g, "$1($2, $3) ")
    .replace(/\\(?:cdot|times)/g, "*").replace(/\\div/g, "/").replace(/\\(?:le|leq)\b/g, "<=").replace(/\\(?:ge|geq)\b/g, ">=").replace(/\\(?:ne|neq)\b/g, "!=")
    .replace(/\\(?:to|rightarrow)\b/g, "->").replace(/\\Rightarrow\b/g, "=>").replace(/\\pm\b/g, "+-").replace(/\\approx\b/g, "~~").replace(/\\infty\b/g, "inf")
    .replace(/\\circ\b/g, "deg").replace(/\\[,;:! ]/g, " ").replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/\^\{([^{}]*)\}/g, (_, e: string) => (/^[\w.]+$/.test(e) ? `^${e}` : `^(${e})`))
    .replace(/_\{([^{}]*)\}/g, (_, e: string) => (/^[\w.]+$/.test(e) ? `_${e}` : `_(${e})`))
    .replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
  return s;
}

/** y = f(x) in the syntax of the plot widget, or "" when it cannot be drawn. */
export function plotFn(input: unknown): string {
  let s = latexToPlain(str(input, LIMITS.formula)).replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, "").replace(/\*\*/g, "^").replace(/−/g, "-");
  s = s.replace(/\bsqrt\s*(?=\d|x)/g, "sqrt ");
  return compileFn(s) ? s : "";
}

function rowsOf(v: unknown): string[][] {
  if (!Array.isArray(v)) return [];
  const rows = v.slice(0, LIMITS.rows).map((r) => {
    const cells = Array.isArray(r) ? r : r && typeof r === "object" && Array.isArray((r as { cells?: unknown }).cells) ? (r as { cells: unknown[] }).cells : [];
    return cells.slice(0, LIMITS.cols).map((c) => (typeof c === "number" ? String(c) : str(c, LIMITS.cell)));
  }).filter((r) => r.length);
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
}

function pointsOf(v: unknown): [number, number][] {
  if (!Array.isArray(v)) return [];
  const out: [number, number][] = [];
  for (const p of v.slice(0, LIMITS.rows)) {
    const x = num(Array.isArray(p) ? p[0] : (p as { x?: unknown })?.x), y = num(Array.isArray(p) ? p[1] : (p as { y?: unknown })?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
  }
  return out;
}

const fmt = (n: number) => String(Math.round(n * 1e4) / 1e4);
const cleanLine = (l: string) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "");

/** Raw answer of the model → blocks for the page. Neighbouring text blocks are merged into one text. */
export function normalizeBlocks(raw: unknown): PhotoBlock[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { blocks?: unknown }).blocks) ? (raw as { blocks: unknown[] }).blocks : [];
  const out: PhotoBlock[] = [];
  const pushText = (md: string) => {
    if (!md.trim()) return;
    const last = out[out.length - 1];
    if (last?.kind === "text" && last.md.length + md.length < LIMITS.text) last.md += "\n" + md;
    else out.push({ id: bid(), kind: "text", md: md.slice(0, LIMITS.text) });
  };
  for (const item of list.slice(0, LIMITS.blocks * 2)) {
    if (!item || typeof item !== "object") continue;
    const b = item as RawBlock, kind = str(b.kind, 20).toLowerCase();
    if (kind === "heading") {
      const t = str(b.text, 300).replace(/^#+\s*/, "").replace(/\n+/g, " ");
      // The page already has its title: the largest heading on a photo becomes a section heading.
      const level = Math.max(2, Math.min(3, (Math.round(num(b.level)) || 1) + 1));
      if (t) pushText(`${"#".repeat(level)} ${t}`);
    } else if (kind === "text" || kind === "paragraph") {
      pushText(str(b.text, LIMITS.text).split("\n").map((l) => l.replace(/^#{1,3}\s+/, "")).join("\n").replace(/\n{2,}/g, "\n"));
    } else if (kind === "list") {
      const items = (Array.isArray(b.items) ? b.items : str(b.text, LIMITS.text).split("\n")).map((x) => cleanLine(str(x, 500))).filter(Boolean).slice(0, 60);
      const ordered = b.ordered === true;
      pushText(items.map((x, i) => (ordered ? `${i + 1}. ` : "- ") + x).join("\n"));
    } else if (kind === "formula") {
      const src = latexToPlain(str(b.formula ?? b.text, LIMITS.formula));
      if (src) out.push({ id: bid(), kind: "formula", src });
    } else if (kind === "plot" || kind === "graph") {
      const title = str(b.title, 120), fn = plotFn(b.fn ?? b.formula);
      const pts = pointsOf(b.points);
      let xmin = num(b.xmin), xmax = num(b.xmax);
      if (pts.length) { xmin = Number.isFinite(xmin) ? xmin : Math.min(...pts.map((p) => p[0])); xmax = Number.isFinite(xmax) ? xmax : Math.max(...pts.map((p) => p[0])); }
      if (!(xmax > xmin)) { xmin = -5; xmax = 5; }
      xmin = Math.max(-1e6, xmin); xmax = Math.min(1e6, xmax);
      if (fn) out.push({ id: bid(), kind: "plot", fn, xmin, xmax, title });
      else if (pts.length) out.push({ id: bid(), kind: "table", title: title || "Точки графика", rows: [["x", "y"], ...pts.map(([x, y]) => [fmt(x), fmt(y)])] });
    } else if (kind === "table") {
      const rows = rowsOf(b.rows);
      if (rows.length) out.push({ id: bid(), kind: "table", rows, title: str(b.title, 120) });
    }
    if (out.length >= LIMITS.blocks) break;
  }
  return out;
}
