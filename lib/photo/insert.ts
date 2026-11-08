/**
 * Recognised blocks → page elements (widgets). Text becomes a text widget with lines, a formula
 * a formula widget, a plot the plot widget, a table the table widget. Each element carries its
 * placement, so the whole import is one history step and lands right where it was asked for.
 */
import { makeElement } from "@/lib/editor/factory";
import { toTex } from "@/lib/editor/board/math";
import { COLS, markdownToLines, linesToMarkdown, summary, type Layout, type WidgetData } from "@/lib/editor/board/model";
import type { ImageContent } from "@/lib/data/images";
import type { CanvasElement } from "@/lib/types";
import type { PhotoBlock } from "./blocks";

export type PhotoImage = { content: ImageContent; width: number; height: number };
const placement = (layout: Layout) => ({ layout, documentOrder: layout.key });
const SPAN: Record<PhotoBlock["kind"], number> = { text: COLS, formula: COLS, plot: 14, table: 16 };

/** Titles of plots and tables go into the text before them as a small heading. */
function withTitles(blocks: PhotoBlock[]): PhotoBlock[] {
  const out: PhotoBlock[] = [];
  for (const b of blocks) {
    const title = (b.kind === "plot" || b.kind === "table") && b.title.trim();
    if (title) {
      const last = out[out.length - 1];
      if (last?.kind === "text") out[out.length - 1] = { ...last, md: `${last.md}\n### ${title}` };
      else out.push({ id: `${b.id}h`, kind: "text", md: `### ${title}` });
    }
    out.push(b);
  }
  return out;
}

/** Elements for `blocks`, keyed between `from` and `to` (to = Infinity when they go to the end). */
export function blocksToElements(blocks: PhotoBlock[], canvasId: string, z: number, from: number, to: number, image?: PhotoImage | null): CanvasElement[] {
  const list = withTitles(blocks.filter((b) => b.kind !== "text" || b.md.trim()));
  const n = list.length + (image ? 1 : 0);
  const keyAt = (i: number) => (Number.isFinite(to) ? from + ((to - from) * (i + 1)) / (n + 1) : from + i + 1);
  const at = { x: 0, y: 0 };
  const out: CanvasElement[] = [];
  let i = 0;
  if (image) {
    const layout: Layout = { col: 0, span: 12, key: keyAt(i++) };
    out.push(makeElement("image", at, canvasId, z++, { width: image.width, height: image.height, content: { ...image.content, ...placement(layout) }, style: {} }));
  }
  for (const b of list) {
    const layout: Layout = { col: 0, span: SPAN[b.kind], key: keyAt(i++) };
    if (b.kind === "text") {
      const lines = markdownToLines(b.md);
      out.push(makeElement("text", at, canvasId, z++, { content: { lines, text: linesToMarkdown(lines), ...placement(layout) } }));
    } else if (b.kind === "formula") {
      out.push(makeElement("formula", at, canvasId, z++, { content: { src: b.src, latex: toTex(b.src), ...placement(layout) } }));
    } else {
      const data: WidgetData["plot"] | WidgetData["table"] = b.kind === "plot" ? { f1: b.fn, f2: "", xmin: b.xmin, xmax: b.xmax } : { rows: b.rows };
      const t = b.kind;
      out.push(makeElement("note", at, canvasId, z++, { content: { widget: t, data, text: summary(t, data), ...placement(layout) }, style: { color: "gray", fontSize: 16 } }));
    }
  }
  return out;
}
