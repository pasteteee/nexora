"use client";
import { Redo2, Undo2 } from "lucide-react";
import { Group, IconButton } from "@/components/ui";
import { useEditor } from "@/lib/editor/store";

export function HistoryButtons() {
  const canUndo = useEditor((st) => st.past.length > 0);
  const canRedo = useEditor((st) => st.future.length > 0);
  const canEdit = useEditor((st) => st.canEdit);
  if (!canEdit) return null;
  return (
    <Group>
      <IconButton tip="Отменить  Ctrl+Z" disabled={!canUndo} onClick={() => useEditor.getState().undo()}><Undo2 size={17} /></IconButton>
      <IconButton tip="Повторить  Ctrl+Shift+Z" disabled={!canRedo} onClick={() => useEditor.getState().redo()}><Redo2 size={17} /></IconButton>
    </Group>
  );
}
