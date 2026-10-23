"use client";
import { bbox, toScreen, type Handle, type Rect } from "@/lib/editor/geometry";
import { useEditor } from "@/lib/editor/store";
import s from "./editor.module.css";

const HANDLES: { h: Handle; fx: number; fy: number; cursor: string }[] = [
  { h: "nw", fx: 0, fy: 0, cursor: "nwse-resize" }, { h: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { h: "ne", fx: 1, fy: 0, cursor: "nesw-resize" }, { h: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { h: "se", fx: 1, fy: 1, cursor: "nwse-resize" }, { h: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { h: "sw", fx: 0, fy: 1, cursor: "nesw-resize" }, { h: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

/** Рамка выделения и маркеры в экранных координатах: размер маркеров не зависит от масштаба */
export function SelectionOverlay({ marquee, onHandleDown }: { marquee: Rect | null; onHandleDown(e: React.PointerEvent, h: Handle): void }) {
  const camera = useEditor((st) => st.camera);
  const selected = useEditor((st) => st.selected);
  const els = useEditor((st) => st.els);
  const canEdit = useEditor((st) => st.canEdit);

  const items = selected.map((id) => els[id]).filter(Boolean);
  const box = bbox(items);
  const scr = (r: Rect) => {
    const p = toScreen(r, camera);
    return { left: p.x, top: p.y, width: r.width * camera.zoom, height: r.height * camera.zoom };
  };
  const resizable = canEdit && items.length === 1 && items[0].type !== "connector";

  return (
    <div className={s.overlay}>
      {items.length > 1 && items.map((e) => <div key={e.id} className={s.selItem} style={scr(e)} />)}
      {box && <div className={s.selBox} style={scr(box)} />}
      {box && resizable && HANDLES.map(({ h, fx, fy, cursor }) => {
        const r = scr(box);
        return (
          <div key={h} className={s.handle} data-handle={h} style={{ left: r.left + r.width * fx, top: r.top + r.height * fy, cursor }}
            onPointerDown={(e) => onHandleDown(e, h)} />
        );
      })}
      {marquee && <div className={s.marquee} style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
    </div>
  );
}
