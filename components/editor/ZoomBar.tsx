"use client";
import { Maximize, Minus, Plus } from "lucide-react";
import { Group, IconButton } from "@/components/ui";
import { bbox, fitRect } from "@/lib/editor/geometry";
import { useEditor } from "@/lib/editor/store";
import s from "./editor.module.css";

const STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function ZoomBar({ view }: { view: () => { width: number; height: number } }) {
  const zoom = useEditor((st) => st.camera.zoom);
  const zoomTo = useEditor((st) => st.zoomTo);
  const center = () => { const v = view(); return { x: v.width / 2, y: v.height / 2 }; };
  const next = (dir: 1 | -1) => (dir > 0 ? STEPS.find((z) => z > zoom + 1e-3) ?? 4 : [...STEPS].reverse().find((z) => z < zoom - 1e-3) ?? 0.1);

  function fit() {
    const st = useEditor.getState();
    const box = bbox(Object.values(st.els));
    st.setCamera(box ? fitRect(box, view()) : { x: view().width / 2, y: view().height / 2, zoom: 1 });
  }

  return (
    <div className={s.br}>
      <Group>
        <IconButton tip="Отдалить  −" onClick={() => zoomTo(center(), next(-1))}><Minus size={16} /></IconButton>
        <button className={s.zoomLabel} title="100 %" onClick={() => zoomTo(center(), 1)}>{Math.round(zoom * 100)}%</button>
        <IconButton tip="Приблизить  +" onClick={() => zoomTo(center(), next(1))}><Plus size={16} /></IconButton>
        <IconButton tip="Показать всё  ⇧1" onClick={fit}><Maximize size={16} /></IconButton>
      </Group>
    </div>
  );
}
