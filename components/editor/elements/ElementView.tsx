"use client";
import { memo } from "react";
import { fillOf } from "@/lib/editor/styles";
import type { CanvasElement } from "@/lib/types";
import { Formula } from "./Formula";
import { ImageView } from "./ImageView";
import { Shape } from "./Shape";
import { SourceCard } from "./SourceCard";
import { TextBody } from "./TextBody";
import s from "./elements.module.css";

/** Отрисовка объекта по типу; соединители рисует ConnectorLayer, группа видна только рамкой выделения */
export const ElementView = memo(function ElementView({ el }: { el: CanvasElement }) {
  if (el.type === "group" || el.type === "connector") return null;
  const box = { left: el.x, top: el.y, width: el.width, height: el.height, zIndex: el.zIndex };
  const color = el.style.color ?? el.style.fill;
  let body: React.ReactNode;
  let cls = s.el;
  switch (el.type) {
    case "text":
      body = <TextBody el={el} placeholder="Текст" />;
      cls += " " + s.textEl;
      break;
    case "note":
      body = <TextBody el={el} placeholder="Заметка" />;
      cls += " " + s.note;
      break;
    case "diagram_node":
      body = <TextBody el={el} placeholder="Узел" className={s.centered} />;
      cls += " " + s.node;
      break;
    case "shape":
      body = <Shape el={el} />;
      break;
    case "formula":
      body = <Formula el={el} />;
      cls += " " + s.card;
      break;
    case "image":
      body = <ImageView el={el} />;
      cls += " " + s.imageEl;
      break;
    case "source":
    case "source_fragment":
      body = <SourceCard el={el} />;
      cls += " " + s.card;
      break;
  }
  const bg = el.type === "note" || el.type === "diagram_node" ? { background: fillOf(color) } : null;
  return <div className={cls} data-id={el.id} data-type={el.type} style={{ ...box, ...bg }}>{body}</div>;
});
