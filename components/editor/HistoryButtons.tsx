"use client";
import { Redo2, Undo2 } from "lucide-react";
import { Group, IconButton } from "@/components/ui";
import { useDoc } from "@/lib/doc/store";

export function HistoryButtons() {
  const canUndo = useDoc((st) => st.past.length > 0);
  const canRedo = useDoc((st) => st.future.length > 0);
  const canEdit = useDoc((st) => st.canEdit);
  if (!canEdit) return null;
  return (
    <Group>
      <IconButton tip="Отменить  Ctrl+Z" disabled={!canUndo} onClick={() => useDoc.getState().undo()}><Undo2 size={17} /></IconButton>
      <IconButton tip="Повторить  Ctrl+Shift+Z" disabled={!canRedo} onClick={() => useDoc.getState().redo()}><Redo2 size={17} /></IconButton>
    </Group>
  );
}
