/** Геометрия холста: камера, мировые координаты, границы мира (ТЗ 4.2.4). */
export type Camera = { x: number; y: number; zoom: number }; // x, y — смещение мира в пикселях экрана
export type Rect = { x: number; y: number; width: number; height: number };
export type Pt = { x: number; y: number };

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
export const WORLD = { initial: 5000, step: 5000, max: 500000 };

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const toWorld = (p: Pt, c: Camera): Pt => ({ x: (p.x - c.x) / c.zoom, y: (p.y - c.y) / c.zoom });
export const toScreen = (p: Pt, c: Camera): Pt => ({ x: p.x * c.zoom + c.x, y: p.y * c.zoom + c.y });

/** Масштаб вокруг точки экрана: точка под курсором остаётся на месте */
export function zoomAt(c: Camera, screen: Pt, nextZoom: number): Camera {
  const zoom = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
  const w = toWorld(screen, c);
  return { zoom, x: screen.x - w.x * zoom, y: screen.y - w.y * zoom };
}

/** Камера, показывающая прямоугольник мира целиком с отступом */
export function fitRect(r: Rect, view: { width: number; height: number }, pad = 80): Camera {
  const zoom = clamp(Math.min((view.width - pad * 2) / Math.max(r.width, 1), (view.height - pad * 2) / Math.max(r.height, 1)), ZOOM_MIN, 1);
  return { zoom, x: view.width / 2 - (r.x + r.width / 2) * zoom, y: view.height / 2 - (r.y + r.height / 2) * zoom };
}

export function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function bbox(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rs) {
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width); y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * Границы рабочей области: начальные ±5 000, растут шагом 5 000 до ±500 000.
 * Возвращает новую половину ширины по каждой оси или null, если объект вышел за максимум.
 */
export type Bounds = { hx: number; hy: number };
export function fitBounds(b: Bounds, r: Rect): Bounds | null {
  const needX = Math.max(Math.abs(r.x), Math.abs(r.x + r.width));
  const needY = Math.max(Math.abs(r.y), Math.abs(r.y + r.height));
  if (needX > WORLD.max || needY > WORLD.max) return null;
  const grow = (h: number, need: number) => (need <= h ? h : Math.min(WORLD.max, h + Math.ceil((need - h) / WORLD.step) * WORLD.step));
  return { hx: grow(b.hx, needX), hy: grow(b.hy, needY) };
}

/** Новый прямоугольник при тяге за маркер. handle — «n», «se» и т.д. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export function resizeRect(r: Rect, h: Handle, dx: number, dy: number, keepRatio = false, min = 8): Rect {
  let { x, y, width, height } = r;
  if (h.includes("e")) width += dx;
  if (h.includes("w")) { x += dx; width -= dx; }
  if (h.includes("s")) height += dy;
  if (h.includes("n")) { y += dy; height -= dy; }
  if (keepRatio && h.length === 2) {
    const ratio = r.width / r.height;
    if (width / height > ratio) { const w2 = height * ratio; if (h.includes("w")) x += width - w2; width = w2; }
    else { const h2 = width / ratio; if (h.includes("n")) y += height - h2; height = h2; }
  }
  if (width < min) { if (h.includes("w")) x -= min - width; width = min; }
  if (height < min) { if (h.includes("n")) y -= min - height; height = min; }
  return { x, y, width, height };
}

export const snap = (v: number, step: number) => Math.round(v / step) * step;
