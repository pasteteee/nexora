"use client";
import type { CSSProperties } from "react";
import type { BackgroundType } from "@/lib/types";
import type { Camera } from "@/lib/editor/geometry";

/** Фон холста следует за камерой: шаг в мировых единицах × масштаб */
export function backgroundStyle(type: BackgroundType, spacing: number, c: Camera): CSSProperties {
  const s = spacing * c.zoom;
  if (type === "plain" || s < 5) return {};
  const pos = `${c.x % s}px ${c.y % s}px`;
  const line = "var(--grid)";
  if (type === "dots") {
    const r = Math.max(0.8, Math.min(1.6, c.zoom * 1.2));
    return { backgroundImage: `radial-gradient(${line} ${r}px, transparent ${r}px)`, backgroundSize: `${s}px ${s}px`, backgroundPosition: pos };
  }
  if (type === "lines") {
    return { backgroundImage: `linear-gradient(to bottom, ${line} 1px, transparent 1px)`, backgroundSize: `100% ${s}px`, backgroundPosition: pos };
  }
  return {
    backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
    backgroundSize: `${s}px ${s}px`,
    backgroundPosition: pos,
  };
}
