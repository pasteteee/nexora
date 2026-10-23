"use client";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround, BringToFront, ClipboardPaste, Copy, CopyPlus,
  Group as GroupIcon, ImagePlus, Maximize, MousePointerSquareDashed, Paperclip, Pencil, Scissors, SendToBack,
  StickyNote, Trash2, Type, Ungroup, ArrowDown, ArrowUp,
} from "lucide-react";
import type { MenuItem } from "@/components/ui";
import { IMAGE_ACCEPT, SOURCE_ACCEPT } from "@/lib/data/upload-rules";
import {
  align, arrangeZ, create, deleteSelection, distribute, groupSelection, insertImages, insertSources, pickFiles,
  startEditing, ungroupSelection, withGroups,
} from "@/lib/editor/actions";
import { rectOf } from "@/lib/editor/connector";
import { bbox, fitRect, type Pt } from "@/lib/editor/geometry";
import { useEditor } from "@/lib/editor/store";
import { copySelection, duplicateSelection, hasClipboard, pasteClipboard } from "./useHotkeys";

const I = 16;
const EDITABLE = new Set(["text", "note", "shape", "diagram_node", "formula"]);

/** Контекстное меню холста (ТЗ 4.4): по объекту — действия с выделением, по пустому месту — создание */
export function contextItems(at: Pt): MenuItem[] {
  const st = useEditor.getState();
  const items = st.selected.map((id) => st.els[id]).filter(Boolean);
  const edit = st.canEdit;
  if (!items.length) {
    return [
      { label: "Вставить", icon: <ClipboardPaste size={I} />, kbd: "Ctrl+V", onSelect: pasteClipboard, hidden: !edit || !hasClipboard() },
      { label: "Заметка", icon: <StickyNote size={I} />, kbd: "N", onSelect: () => { const e = create("note", at); if (e) startEditing(e.id); }, hidden: !edit },
      { label: "Текст", icon: <Type size={I} />, kbd: "T", onSelect: () => { const e = create("text", at); if (e) startEditing(e.id); }, hidden: !edit },
      { label: "Изображение…", icon: <ImagePlus size={I} />, onSelect: async () => insertImages(await pickFiles(IMAGE_ACCEPT), at), hidden: !edit },
      { label: "Файл-источник…", icon: <Paperclip size={I} />, onSelect: async () => insertSources(await pickFiles(SOURCE_ACCEPT), at), hidden: !edit },
      { sep: true },
      { label: "Выделить всё", icon: <MousePointerSquareDashed size={I} />, kbd: "Ctrl+A", onSelect: () => st.select(Object.values(st.els).filter((x) => x.type !== "group").map((x) => x.id)) },
      { label: "Показать всё", icon: <Maximize size={I} />, kbd: "⇧1", onSelect: () => {
        const box = bbox(Object.values(st.els).map((x) => rectOf(x, st.els)));
        if (box) st.setCamera(fitRect(box, { width: window.innerWidth, height: window.innerHeight }));
      } },
    ];
  }
  const many = withGroups(st.selected).filter((e) => e.type !== "group" && e.type !== "connector").length > 1;
  const grouped = withGroups(st.selected).some((e) => e.type === "group");
  const one = items.length === 1 ? items[0] : null;
  return [
    { label: "Редактировать", icon: <Pencil size={I} />, kbd: "Enter", onSelect: () => startEditing(one!.id), hidden: !edit || !one || !EDITABLE.has(one.type) },
    { label: "Копировать", icon: <Copy size={I} />, kbd: "Ctrl+C", onSelect: copySelection },
    { label: "Вырезать", icon: <Scissors size={I} />, kbd: "Ctrl+X", onSelect: () => { copySelection(); deleteSelection(); }, hidden: !edit },
    { label: "Дублировать", icon: <CopyPlus size={I} />, kbd: "Ctrl+D", onSelect: duplicateSelection, hidden: !edit },
    { sep: true },
    { label: "Сгруппировать", icon: <GroupIcon size={I} />, kbd: "Ctrl+G", onSelect: groupSelection, hidden: !edit || !many || (grouped && items.length === withGroups(st.selected).length - 1) },
    { label: "Разгруппировать", icon: <Ungroup size={I} />, kbd: "Ctrl+⇧G", onSelect: ungroupSelection, hidden: !edit || !grouped },
    { label: "По левому краю", icon: <AlignStartVertical size={I} />, onSelect: () => align("left"), hidden: !edit || !many },
    { label: "По центру", icon: <AlignCenterVertical size={I} />, onSelect: () => align("hcenter"), hidden: !edit || !many },
    { label: "По правому краю", icon: <AlignEndVertical size={I} />, onSelect: () => align("right"), hidden: !edit || !many },
    { label: "По верхнему краю", icon: <AlignStartHorizontal size={I} />, onSelect: () => align("top"), hidden: !edit || !many },
    { label: "По середине", icon: <AlignCenterHorizontal size={I} />, onSelect: () => align("vcenter"), hidden: !edit || !many },
    { label: "По нижнему краю", icon: <AlignEndHorizontal size={I} />, onSelect: () => align("bottom"), hidden: !edit || !many },
    { label: "Распределить по горизонтали", icon: <AlignHorizontalSpaceAround size={I} />, onSelect: () => distribute("x"), hidden: !edit || withGroups(st.selected).length < 3 },
    { label: "Распределить по вертикали", icon: <AlignVerticalSpaceAround size={I} />, onSelect: () => distribute("y"), hidden: !edit || withGroups(st.selected).length < 3 },
    { sep: true },
    { label: "На передний план", icon: <BringToFront size={I} />, kbd: "Ctrl+]", onSelect: () => arrangeZ("front"), hidden: !edit },
    { label: "Выше", icon: <ArrowUp size={I} />, kbd: "]", onSelect: () => arrangeZ("forward"), hidden: !edit },
    { label: "Ниже", icon: <ArrowDown size={I} />, kbd: "[", onSelect: () => arrangeZ("backward"), hidden: !edit },
    { label: "На задний план", icon: <SendToBack size={I} />, kbd: "Ctrl+[", onSelect: () => arrangeZ("back"), hidden: !edit },
    { sep: true },
    { label: "Удалить", icon: <Trash2 size={I} />, kbd: "Del", danger: true, onSelect: deleteSelection, hidden: !edit },
  ];
}
