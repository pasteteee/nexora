/**
 * Last-write-wins по серверному updated_at (ТЗ 4.2.9).
 * Метки Postgres содержат микросекунды, Date.parse их отбрасывает, поэтому сравниваем
 * с точностью до микросекунды: две записи в одну миллисекунду всё равно упорядочены.
 */
import type { CanvasElement } from "@/lib/types";

export function stamp(value: string | null | undefined): number {
  if (!value) return -Infinity;
  const m = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(value.trim().replace(" ", "T"));
  if (!m) { const t = Date.parse(value); return Number.isNaN(t) ? -Infinity : t * 1000; }
  const [, base, frac = "", zone = "Z"] = m;
  const ms = Date.parse(base + (zone.length === 3 ? zone + ":00" : zone));
  if (Number.isNaN(ms)) return -Infinity;
  return ms * 1000 + Number((frac + "000000").slice(0, 6));
}

/** Совпадают ли объекты без учёта метки времени: тогда не трогаем стор и не сбиваем ввод */
export function sameContent(a: CanvasElement, b: CanvasElement): boolean {
  return stableJson({ ...a, updatedAt: null }) === stableJson({ ...b, updatedAt: null });
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
