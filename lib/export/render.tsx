"use client";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { toCanvas } from "html-to-image";
import { ExportDocument } from "@/components/export/ExportDocument";
import s from "@/components/export/export.module.css";
import { imageUrl } from "@/lib/data";
import type { BackgroundType, CanvasElement } from "@/lib/types";
import { checkExportArea } from "./area";
import { imagesToPdf, pageSliceHeight } from "./pdf";

export interface SnapshotOptions {
  title?: string;
  blocks: CanvasElement[];
  background: { type: BackgroundType; spacing: number } | null;
  scale: 1 | 2;
}

export class ExportError extends Error {}

async function toDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const res = await fetch(src, { credentials: "omit" });
  if (!res.ok) throw new Error("image");
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Signed URLs are resolved and inlined first, so the snapshot never taints the canvas. */
async function resolveImages(blocks: CanvasElement[]): Promise<Record<string, string>> {
  const entries = await Promise.all(blocks.filter((el) => el.type === "image").map(async (el) => {
    try {
      const inline = el.content.dataUrl as string | undefined, path = el.content.path as string | undefined;
      const src = inline ?? (path ? await imageUrl(path) : null);
      return src ? [el.id, await toDataUrl(src)] as const : null;
    } catch { return null; }
  }));
  return Object.fromEntries(entries.filter((e): e is readonly [string, string] => !!e));
}

/** Renders the page offscreen with a fixed light palette and returns a canvas at the requested scale. */
export async function renderSnapshot(opts: SnapshotOptions): Promise<HTMLCanvasElement> {
  const images = await resolveImages(opts.blocks);
  const stage = document.createElement("div");
  stage.className = s.stage;
  stage.setAttribute("aria-hidden", "true");
  document.body.appendChild(stage);
  const root = createRoot(stage);
  try {
    flushSync(() => root.render(<div className={s.frame} data-bg={opts.background ? "true" : "false"} data-pattern={opts.background?.type ?? "plain"}
      style={{ ["--spacing" as string]: `${opts.background?.spacing ?? 24}px` }}>
      <ExportDocument title={opts.title} blocks={opts.blocks} images={images} />
    </div>));
    const frame = stage.firstElementChild as HTMLElement;
    await Promise.all([...frame.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
    await document.fonts?.ready;
    const { width, height } = frame.getBoundingClientRect();
    const problem = checkExportArea(width, height);
    if (problem) throw new ExportError(problem);
    return await toCanvas(frame, {
      pixelRatio: opts.scale, width: Math.ceil(width), height: Math.ceil(height),
      backgroundColor: opts.background ? "#ffffff" : undefined, cacheBust: false,
    });
  } finally {
    root.unmount();
    stage.remove();
  }
}

export const canvasToBlob = (canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new ExportError("Не удалось создать файл")), type, quality));

/** Splits a tall snapshot into A4 sheets and packs them into a PDF. */
export async function canvasToPdf(canvas: HTMLCanvasElement, title: string): Promise<Blob> {
  const slice = pageSliceHeight(canvas.width);
  const pages = [];
  for (let y = 0; y < canvas.height; y += slice) {
    const h = Math.min(slice, canvas.height - y);
    const sheet = document.createElement("canvas");
    sheet.width = canvas.width; sheet.height = h;
    const ctx = sheet.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, sheet.width, h);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    const jpeg = new Uint8Array(await (await canvasToBlob(sheet, "image/jpeg", 0.92)).arrayBuffer());
    pages.push({ jpeg, width: sheet.width, height: h });
  }
  const bytes = imagesToPdf(pages, title);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  // Keep the anchor and URL alive until the browser has picked up the download.
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 10_000);
}
