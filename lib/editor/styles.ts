import type { CSSProperties } from "react";
import type { CanvasElement } from "@/lib/types";

/** Палитры объектов: значения в БД — ключи, цвета берутся из токенов темы */
export const COLORS = ["yellow", "pink", "green", "blue", "violet", "gray"] as const;
export type Color = (typeof COLORS)[number];
export const STROKES = ["ink", "accent", "red", "green", "gray", "none"] as const;
export type Stroke = (typeof STROKES)[number];
export const FONT_SIZES = [12, 14, 16, 20, 24, 32] as const;
export const SHAPES = ["rect", "ellipse", "diamond", "triangle"] as const;
export type ShapeKind = (typeof SHAPES)[number];

export const MAX_TEXT = { text: 20000, note: 500, shape: 500, diagram_node: 200 } as const;

export const fillOf = (c: unknown) =>
  c === "none" ? "transparent"
    : typeof c === "string" && c.startsWith("var(") ? c
      : `var(--note-${COLORS.includes(c as Color) ? c : "yellow"})`;

const STROKE_VAR: Record<Stroke, string> = {
  ink: "var(--ink)", accent: "var(--accent)", red: "var(--danger)", green: "var(--ok)", gray: "var(--ink-3)", none: "transparent",
};
export const strokeOf = (c: unknown) => STROKE_VAR[(c as Stroke) in STROKE_VAR ? (c as Stroke) : "ink"];

export type TextStyle = {
  fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean;
  align?: "left" | "center" | "right";
};

/** Форматирование текста объекта (ТЗ 4.2.5): размер, начертание, выравнивание, перенос строк */
export function textCss(style: CanvasElement["style"], fallbackSize = 16): CSSProperties {
  const t = style as TextStyle;
  const deco = [t.underline && "underline", t.strike && "line-through"].filter(Boolean).join(" ");
  return {
    fontSize: t.fontSize ?? fallbackSize,
    fontWeight: t.bold ? 650 : 400,
    fontStyle: t.italic ? "italic" : "normal",
    textDecoration: deco || "none",
    textAlign: t.align ?? "left",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    lineHeight: 1.4,
  };
}
