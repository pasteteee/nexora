"use client";
import { useEffect, useRef, useState } from "react";
import { Group, IconButton } from "@/components/ui";
import { data } from "@/lib/data";
import { useEditor } from "@/lib/editor/store";
import type { BackgroundType } from "@/lib/types";
import { backgroundStyle } from "./Background";
import s from "./editor.module.css";

const TYPES: { type: BackgroundType; label: string }[] = [
  { type: "plain", label: "Чистый" }, { type: "grid", label: "Клетка" },
  { type: "dots", label: "Точки" }, { type: "lines", label: "Линейка" },
];
const SPACING = [16, 24, 32, 48] as const;
const PREVIEW = { x: 0, y: 0, zoom: 0.5 };

export function BackgroundPicker() {
  const { background, setBackground, canvasId, canEdit } = useEditor();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  function pick(b: Partial<typeof background>) {
    setBackground(b);
    const next = { ...background, ...b };
    if (canvasId) data.updateCanvas(canvasId, { backgroundType: next.type, backgroundSpacing: next.spacing }).catch(() => {});
  }

  if (!canEdit) return null;
  return (
    <div className={s.bl} ref={ref}>
      <Group>
        <IconButton tip="Фон страницы" active={open} onClick={() => setOpen(!open)}>
          <span className={s.bgPreview} style={backgroundStyle(background.type, 12, { x: 0, y: 0, zoom: 1 })} />
        </IconButton>
      </Group>
      {open && (
        <div className={s.pop}>
          <div className={s.swatches}>
            {TYPES.map((t) => (
              <button key={t.type} className={s.swatch} title={t.label} aria-label={t.label} aria-pressed={background.type === t.type}
                style={backgroundStyle(t.type, 24, PREVIEW)} onClick={() => pick({ type: t.type })} />
            ))}
          </div>
          <div className={s.steps}>
            {SPACING.map((n) => (
              <button key={n} className={s.step} aria-pressed={background.spacing === n} onClick={() => pick({ spacing: n })}>{n}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
