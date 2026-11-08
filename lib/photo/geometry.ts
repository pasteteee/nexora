/**
 * Geometry of a photographed sheet: the four corners the user drags (in pixels of the rotated photo)
 * and the projective map that turns that quadrilateral into a flat rectangle.
 * Pure functions, so the maths is tested without a browser.
 */
export type Pt = { x: number; y: number };
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];

export const fullQuad = (w: number, h: number): Quad => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Size of the flattened sheet: the longer of each pair of opposite edges, scaled down to `max` on the long side. */
export function outputSize(q: Quad, max = 2000): { w: number; h: number } {
  let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const k = Math.min(1, max / Math.max(w, h, 1));
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  return { w, h };
}

/** True when the quadrilateral is an axis-aligned rectangle: a plain crop is enough, no warp needed. */
export function isRect(q: Quad, eps = 0.5): boolean {
  return Math.abs(q[0].y - q[1].y) < eps && Math.abs(q[3].y - q[2].y) < eps && Math.abs(q[0].x - q[3].x) < eps && Math.abs(q[1].x - q[2].x) < eps;
}

/** Corners inside the photo and in their places: a corner cannot cross to the other side of the sheet. */
export function clampQuad(q: Quad, w: number, h: number, min = 24): Quad {
  const c = q.map((p) => ({ x: Math.max(0, Math.min(w, p.x)), y: Math.max(0, Math.min(h, p.y)) })) as Quad;
  const cx = (c[0].x + c[1].x + c[2].x + c[3].x) / 4, cy = (c[0].y + c[1].y + c[2].y + c[3].y) / 4;
  const want: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  return c.map((p, i) => {
    const [sx, sy] = want[i];
    return { x: sx < 0 ? Math.min(p.x, cx - min / 2) : Math.max(p.x, cx + min / 2), y: sy < 0 ? Math.min(p.y, cy - min / 2) : Math.max(p.y, cy + min / 2) };
  }) as Quad;
}

/**
 * Homography H (3x3, row-major, h33 = 1) that maps the unit-free rectangle (0,0)-(w,h) onto `q`:
 * a pixel of the flat output at (u, v) is read from the photo at H·(u, v, 1).
 */
export function homography(w: number, h: number, q: Quad): number[] {
  const src: Pt[] = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = src[i], { x, y } = q[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    if (Math.abs(d) < 1e-12) throw new Error("Углы рамки лежат на одной линии");
    for (let k = c; k < 9; k++) A[c][k] /= d;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f) for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((r) => r[8]), 1];
}

export function project(H: number[], u: number, v: number): Pt {
  const z = H[6] * u + H[7] * v + H[8];
  return { x: (H[0] * u + H[1] * v + H[2]) / z, y: (H[3] * u + H[4] * v + H[5]) / z };
}

/** Corners of a photo rotated by a quarter turn clockwise (`turns` times), in the new photo's pixels. */
export function rotateQuad(q: Quad, w: number, h: number, turns: number): Quad {
  let cur = q, cw = w, ch = h;
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    // (x, y) -> (ch - y, x); the corner that was bottom-left becomes top-left
    const r = cur.map((p) => ({ x: ch - p.y, y: p.x }));
    cur = [r[3], r[0], r[1], r[2]];
    [cw, ch] = [ch, cw];
  }
  return cur;
}
