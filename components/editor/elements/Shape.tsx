"use client";
import { fillOf, strokeOf, type ShapeKind } from "@/lib/editor/styles";
import type { CanvasElement } from "@/lib/types";
import { TextBody } from "./TextBody";
import s from "./elements.module.css";

const PATHS: Record<ShapeKind, React.ReactNode> = {
  rect: <rect x="1" y="1" width="98" height="98" rx="6" />,
  ellipse: <ellipse cx="50" cy="50" rx="49" ry="49" />,
  diamond: <polygon points="50,1 99,50 50,99 1,50" />,
  triangle: <polygon points="50,1 99,99 1,99" />,
};

/** Фигура: прямоугольник, эллипс, ромб, треугольник с заливкой и обводкой */
export function Shape({ el }: { el: CanvasElement }) {
  const kind = (el.content.kind as ShapeKind) in PATHS ? (el.content.kind as ShapeKind) : "rect";
  return (
    <>
      <svg className={s.shapeSvg} viewBox="0 0 100 100" preserveAspectRatio="none"
        fill={fillOf(el.style.fill)} stroke={strokeOf(el.style.stroke)} strokeWidth={2} vectorEffect="non-scaling-stroke">
        <g vectorEffect="non-scaling-stroke">{PATHS[kind]}</g>
      </svg>
      <TextBody el={el} className={`${s.centered} ${kind === "triangle" ? s.lower : ""}`} />
    </>
  );
}
