import { describe, expect, it } from "vitest";
import { fitBounds, resizeRect, toScreen, toWorld, WORLD, zoomAt, ZOOM_MAX, ZOOM_MIN } from "@/lib/editor/geometry";

describe("камера", () => {
  it("мир ↔ экран обратимы", () => {
    const c = { x: 120, y: -40, zoom: 1.7 };
    const p = { x: 100000, y: -100000 };
    const back = toWorld(toScreen(p, c), c);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });
  it("zoom вокруг курсора держит точку на месте и ограничен 10–400 %", () => {
    const c = { x: 0, y: 0, zoom: 1 };
    const cur = { x: 300, y: 200 };
    const before = toWorld(cur, c);
    const z = zoomAt(c, cur, 2.5);
    const after = toWorld(cur, z);
    expect(after.x).toBeCloseTo(before.x);
    expect(zoomAt(c, cur, 99).zoom).toBe(ZOOM_MAX);
    expect(zoomAt(c, cur, 0.001).zoom).toBe(ZOOM_MIN);
  });
});

describe("границы мира", () => {
  const start = { hx: WORLD.initial, hy: WORLD.initial };
  it("внутри — без изменений", () => {
    expect(fitBounds(start, { x: 100, y: 100, width: 50, height: 50 })).toEqual(start);
  });
  it("расширяется шагом 5 000 по нужной оси", () => {
    expect(fitBounds(start, { x: 5100, y: 0, width: 10, height: 10 })).toEqual({ hx: 10000, hy: 5000 });
    expect(fitBounds(start, { x: 0, y: -12000, width: 10, height: 10 })).toEqual({ hx: 5000, hy: 15000 });
  });
  it("за ±500 000 — отказ", () => {
    expect(fitBounds(start, { x: 499995, y: 0, width: 10, height: 10 })).toBeNull();
    expect(fitBounds(start, { x: 100000, y: -100000, width: 10, height: 10 })).toEqual({ hx: 105000, hy: 100000 });
  });
});

describe("resize", () => {
  const r = { x: 0, y: 0, width: 100, height: 50 };
  it("юго-восток растит размер", () => expect(resizeRect(r, "se", 20, 10)).toEqual({ x: 0, y: 0, width: 120, height: 60 }));
  it("северо-запад двигает начало", () => expect(resizeRect(r, "nw", 10, 10)).toEqual({ x: 10, y: 10, width: 90, height: 40 }));
  it("не меньше минимума", () => expect(resizeRect(r, "e", -200, 0).width).toBe(8));
  it("с Shift сохраняет пропорции", () => {
    const n = resizeRect(r, "se", 100, 0, true);
    expect(n.width / n.height).toBeCloseTo(2);
  });
});
