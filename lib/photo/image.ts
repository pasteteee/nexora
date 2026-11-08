"use client";
/**
 * Photo processing in the browser before recognition: rotation by quarter turns, cropping and
 * flattening a sheet shot at an angle (four corners → rectangle), and scan filters that make paper
 * white and ink dark. Everything runs on a canvas, the photo never leaves the device unprocessed.
 */
import { homography, isRect, outputSize, project, type Quad } from "./geometry";

export type PhotoFilter = "original" | "enhance" | "scan" | "bw";
export const PHOTO_FILTERS: [PhotoFilter, string, string][] = [
  ["original", "Как есть", "Без обработки"],
  ["enhance", "Ярче", "Автоконтраст и цвет"],
  ["scan", "Скан", "Белая бумага, тени убраны"],
  ["bw", "Ч/Б", "Чёрный текст на белом"],
];

const MAX_SOURCE = 3200;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
const ctx = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true })!;

/** The photo upright (EXIF orientation applied) and at most 3200 px on the long side. */
export async function loadPhoto(file: Blob): Promise<HTMLCanvasElement> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("Не удалось открыть фото. Подойдут JPEG, PNG, WebP или HEIC, если браузер его читает"); }
  const k = Math.min(1, MAX_SOURCE / Math.max(bmp.width, bmp.height));
  const c = canvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)));
  const g = ctx(c);
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/** A quarter turn clockwise, `turns` times. */
export function rotate(src: HTMLCanvasElement, turns: number): HTMLCanvasElement {
  const t = ((turns % 4) + 4) % 4;
  if (!t) return src;
  const c = t % 2 ? canvas(src.height, src.width) : canvas(src.width, src.height);
  const g = ctx(c);
  g.translate(c.width / 2, c.height / 2);
  g.rotate((t * Math.PI) / 2);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/** Scaled copy for the on-screen preview. */
export function scaled(src: HTMLCanvasElement, max: number): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  if (k === 1) return src;
  const c = canvas(Math.round(src.width * k), Math.round(src.height * k));
  const g = ctx(c);
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** The sheet inside `q` as a flat rectangle. A plain rectangle is a crop; anything else is warped pixel by pixel. */
export function flatten(src: HTMLCanvasElement, q: Quad, max = 2000): HTMLCanvasElement {
  const { w, h } = outputSize(q, max);
  const out = canvas(w, h), g = ctx(out);
  if (isRect(q)) {
    g.imageSmoothingQuality = "high";
    g.drawImage(src, q[0].x, q[0].y, q[1].x - q[0].x, q[3].y - q[0].y, 0, 0, w, h);
    return out;
  }
  const sw = src.width, sh = src.height, from = ctx(src).getImageData(0, 0, sw, sh).data;
  const img = g.createImageData(w, h), to = img.data, H = homography(w, h, q);
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const p = project(H, u + 0.5, v + 0.5);
      const x = Math.min(sw - 1.001, Math.max(0, p.x - 0.5)), y = Math.min(sh - 1.001, Math.max(0, p.y - 0.5));
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, o = (v * w + u) * 4;
      for (let k = 0; k < 3; k++) {
        const top = from[i00 + k] + (from[i10 + k] - from[i00 + k]) * fx, bot = from[i01 + k] + (from[i11 + k] - from[i01 + k]) * fx;
        to[o + k] = top + (bot - top) * fy;
      }
      to[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Low and high luminance percentiles: the levels that become black and white. */
function levels(d: Uint8ClampedArray, lo = 0.01, hi = 0.99): [number, number] {
  const hist = new Uint32Array(256);
  const step = Math.max(1, Math.floor(d.length / 4 / 200_000)) * 4;
  let n = 0;
  for (let i = 0; i < d.length; i += step) { hist[lum(d, i) | 0]++; n++; }
  let a = 0, b = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * lo) { a = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * (1 - hi)) { b = v; break; } }
  return b - a < 32 ? [Math.max(0, a - 16), Math.min(255, b + 16)] : [a, b];
}

/** Brightness of the paper around each pixel: the photo shrunk, blurred and stretched back. Ink is thin, so it disappears. */
function background(src: HTMLCanvasElement): Uint8ClampedArray {
  const small = canvas(Math.max(8, Math.round(src.width / 24)), Math.max(8, Math.round(src.height / 24)));
  const sg = ctx(small);
  sg.filter = "blur(2px)";
  sg.drawImage(src, 0, 0, small.width, small.height);
  // Dilate the bright paper over thin dark strokes once more, so text does not darken its own background.
  const d = sg.getImageData(0, 0, small.width, small.height), px = d.data, copy = new Uint8ClampedArray(px), W = small.width, Hh = small.height;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    let best = 0, bi = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(Hh - 1, Math.max(0, y + dy)), j = (yy * W + xx) * 4, l = lum(copy, j);
      if (l > best) { best = l; bi = j; }
    }
    const o = (y * W + x) * 4;
    px[o] = copy[bi]; px[o + 1] = copy[bi + 1]; px[o + 2] = copy[bi + 2];
  }
  sg.putImageData(d, 0, 0);
  const big = canvas(src.width, src.height), bg = ctx(big);
  bg.imageSmoothingQuality = "high";
  bg.drawImage(small, 0, 0, big.width, big.height);
  return bg.getImageData(0, 0, big.width, big.height).data;
}

/** Filter applied in place. */
export function applyFilter(c: HTMLCanvasElement, f: PhotoFilter): HTMLCanvasElement {
  if (f === "original") return c;
  const g = ctx(c), img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  if (f === "enhance") {
    const [a, b] = levels(d), k = 255 / (b - a);
    for (let i = 0; i < d.length; i += 4) {
      const l = lum(d, i), nl = Math.min(255, Math.max(0, (l - a) * k));
      for (let j = 0; j < 3; j++) {
        // stretch levels, keep hue, a little more saturation
        const v = nl + (d[i + j] - l) * 1.15;
        d[i + j] = v;
      }
    }
  } else {
    const bgd = background(c);
    // Divide by the paper: shadows and uneven light vanish, paper becomes 255.
    for (let i = 0; i < d.length; i += 4) {
      for (let j = 0; j < 3; j++) d[i + j] = Math.min(255, (d[i + j] / Math.max(1, bgd[i + j])) * 255);
    }
    const [a] = levels(d, 0.005, 0.995);
    const black = Math.min(a, 160);
    for (let i = 0; i < d.length; i += 4) {
      if (f === "bw") {
        const v = lum(d, i) < black + (235 - black) * 0.62 ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = v;
      } else {
        // Keep colour of pens a little, push paper to white and ink to dark.
        for (let j = 0; j < 3; j++) {
          const v = (d[i + j] - black) / (240 - black);
          d[i + j] = Math.min(255, Math.max(0, Math.pow(Math.max(0, v), 1.6) * 255));
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** JPEG under `limit` bytes: quality goes down, then the size. */
export async function toJpeg(c: HTMLCanvasElement, limit = 3.5 * 1024 * 1024): Promise<Blob> {
  let cur = c;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const q of [0.9, 0.8, 0.7]) {
      const blob = await new Promise<Blob | null>((r) => cur.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= limit) return blob;
    }
    cur = scaled(cur, Math.max(cur.width, cur.height) * 0.75);
  }
  throw new Error("Фото слишком большое. Обрежьте его");
}
