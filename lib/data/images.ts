"use client";
/** Изображения на холсте (ТЗ 4.2.5): PNG, JPEG, WebP до 25 МиБ, оригинал сохраняется, источником не считается */
import { checkImage } from "./upload-rules";

export type ImageContent = { name: string; mime: string; naturalWidth: number; naturalHeight: number; dataUrl?: string; path?: string };

export async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const r = { width: bmp.width, height: bmp.height };
  bmp.close();
  return r;
}

/** Уменьшенная копия для демо-режима: localStorage вмещает несколько мегабайт */
export async function demoDataUrl(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.88);
}

export function validateImage(file: File) {
  checkImage(file);
}

/** Безопасное имя объекта в хранилище */
export const safeName = (name: string) => name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-120) || "file";
