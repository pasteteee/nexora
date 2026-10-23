"use client";
import { ArrowUpRight, ImagePlus, MousePointer2, Paperclip, RectangleHorizontal, Shapes, Sigma, StickyNote, Type } from "lucide-react";
import { Group, IconButton, Sep } from "@/components/ui";
import { IMAGE_ACCEPT, SOURCE_ACCEPT } from "@/lib/data/upload-rules";
import { insertImages, insertSources, pickFiles } from "@/lib/editor/actions";
import { useEditor } from "@/lib/editor/store";
import { useUi, type Tool } from "@/lib/editor/ui";
import s from "./editor.module.css";

const TOOLS: { tool: Tool; tip: string; icon: React.ReactNode }[] = [
  { tool: "select", tip: "Выбор  V", icon: <MousePointer2 size={18} /> },
  { tool: "text", tip: "Текст  T", icon: <Type size={18} /> },
  { tool: "note", tip: "Заметка  N", icon: <StickyNote size={18} /> },
  { tool: "shape", tip: "Фигура  R", icon: <Shapes size={18} /> },
  { tool: "diagram_node", tip: "Узел схемы  O", icon: <RectangleHorizontal size={18} /> },
  { tool: "connector", tip: "Стрелка  L", icon: <ArrowUpRight size={18} /> },
  { tool: "formula", tip: "Формула  F", icon: <Sigma size={18} /> },
];

/** Основные инструменты — постоянно на экране (ТЗ 4.4: постепенное раскрытие функций) */
export function Toolbar({ shifted }: { shifted: boolean }) {
  const tool = useUi((u) => u.tool);
  const canEdit = useEditor((st) => st.canEdit);
  if (!canEdit) return null;
  return (
    <div className={`${s.tools} ${shifted ? s.toolsShifted : ""}`}>
      <Group vertical>
        {TOOLS.map((t) => (
          <IconButton key={t.tool} tip={t.tip} tipSide="right" active={tool === t.tool} onClick={() => useUi.getState().setTool(t.tool)}>
            {t.icon}
          </IconButton>
        ))}
        <Sep />
        <IconButton tip="Изображение" tipSide="right" onClick={async () => insertImages(await pickFiles(IMAGE_ACCEPT))}>
          <ImagePlus size={18} />
        </IconButton>
        <IconButton tip="Файл-источник" tipSide="right" onClick={async () => insertSources(await pickFiles(SOURCE_ACCEPT))}>
          <Paperclip size={18} />
        </IconButton>
      </Group>
    </div>
  );
}
