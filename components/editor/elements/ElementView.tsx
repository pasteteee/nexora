"use client";
import { memo } from "react";
import type { CanvasElement } from "@/lib/types";
import s from "../editor.module.css";

/** Отрисовка объекта по типу. Типы объектов расширяются в спринте 4. */
export const ElementView = memo(function ElementView({ el }: { el: CanvasElement }) {
  if (el.type === "group") return null; // группа — служебный объект, видна только рамкой выделения
  const style = el.style as { fill?: string; color?: string };
  return (
    <div
      className={s.el}
      data-id={el.id}
      style={{
        left: el.x, top: el.y, width: el.width, height: el.height, zIndex: el.zIndex,
        background: style.fill ?? "var(--note-yellow)", borderRadius: 12, boxShadow: "var(--shadow-1)",
        padding: 12, fontSize: 15, color: "var(--ink)", overflow: "hidden",
      }}
    >
      {String(el.content.text ?? "")}
    </div>
  );
});
