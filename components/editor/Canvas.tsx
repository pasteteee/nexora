"use client";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/editor/store";
import { backgroundStyle } from "./Background";
import { BackgroundPicker } from "./BackgroundPicker";
import { ElementView } from "./elements/ElementView";
import { ZoomBar } from "./ZoomBar";
import s from "./editor.module.css";

export function Canvas() {
  const ref = useRef<HTMLDivElement>(null);
  const camera = useEditor((st) => st.camera);
  const background = useEditor((st) => st.background);
  const bounds = useEditor((st) => st.bounds);
  const els = useEditor((st) => st.els);
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ x: number; y: number } | null>(null);

  const view = () => ref.current?.getBoundingClientRect() ?? { width: 1, height: 1, left: 0, top: 0 };

  // колесо: pinch/Ctrl — масштаб вокруг курсора, иначе — прокрутка камеры
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = useEditor.getState();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        st.zoomTo({ x: e.clientX - r.left, y: e.clientY - r.top }, st.camera.zoom * Math.exp(-e.deltaY * 0.01));
      } else {
        st.panBy(-(e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), e.shiftKey && !e.deltaX ? 0 : -e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // пробел — временная «рука»
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /INPUT|TEXTAREA/.test(t.tagName));
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e.target)) { e.preventDefault(); setSpace(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpace(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // первый вход: начало координат по центру экрана
  useEffect(() => {
    const st = useEditor.getState();
    if (st.camera.x === 0 && st.camera.y === 0) {
      const r = view();
      st.setCamera({ x: r.width / 2, y: r.height / 2, zoom: st.camera.zoom });
    }
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button === 1 || space || e.button === 0 && e.target === ref.current && e.altKey) {
      e.preventDefault();
      ref.current!.setPointerCapture(e.pointerId);
      pan.current = { x: e.clientX, y: e.clientY };
      setPanning(true);
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pan.current) return;
    useEditor.getState().panBy(e.clientX - pan.current.x, e.clientY - pan.current.y);
    pan.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() { pan.current = null; setPanning(false); }

  return (
    <>
      <div
        ref={ref}
        tabIndex={0}
        className={`${s.viewport} ${panning ? s.panning : space ? s.spaceReady : ""}`}
        style={backgroundStyle(background.type, background.spacing, camera)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className={s.world} style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
          <div className={s.boundary} style={{ left: -bounds.hx, top: -bounds.hy, width: bounds.hx * 2, height: bounds.hy * 2 }} />
          {Object.values(els).map((el) => <ElementView key={el.id} el={el} />)}
        </div>
      </div>
      <ZoomBar view={view} />
      <BackgroundPicker />
    </>
  );
}
