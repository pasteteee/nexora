"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import s from "./landing.module.css";

// y = x² on x ∈ [-2, 2]; svg x = 110 + 40x, y = 120 - 28x².
const X0 = 110, Y0 = 120, KX = 40, KY = 28;
const sx = (x: number) => X0 + KX * x;
const sy = (y: number) => Y0 - KY * y;
const CURVE = Array.from({ length: 41 }, (_, i) => -2 + i * 0.1).map((x, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(x * x).toFixed(1)}`).join(" ");

/** The plot widget with a tangent that follows the pointer; idle, the point drifts along the curve. */
export function TangentPlot() {
  const [a, setA] = useState(1);
  const hover = useRef(false);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, visible = true;
    const t0 = performance.now();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    if (svg.current) io.observe(svg.current);
    const tick = (now: number) => {
      if (visible && !hover.current) setA(Math.round(Math.sin((now - t0) / 1800) * 140) / 100);
      raf = requestAnimationFrame(tick);
    };
    const start = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, 1800);
    return () => { clearTimeout(start); cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  const follow = (e: PointerEvent<SVGSVGElement>) => {
    if (e.buttons) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width * 220 - X0) / KX;
    hover.current = true;
    setA(Math.round(Math.max(-1.6, Math.min(1.6, x)) * 100) / 100);
  };
  const k = 2 * a, b = a * a;
  const line = (x: number) => k * (x - a) + b;
  const x1 = a - 1.3, x2 = a + 1.3;

  return <>
    <div className={s.wLabel}><span>y = x²</span><span>наклон {k.toFixed(1).replace(".", ",")}</span></div>
    <svg ref={svg} viewBox="0 0 220 150" role="img" aria-label={`Парабола y = x² и касательная в точке x = ${a}`}
      onPointerMove={follow} onPointerLeave={() => { hover.current = false; }}>
      <line x1="10" y1={Y0} x2="210" y2={Y0} stroke="currentColor" strokeOpacity=".3" />
      <line x1={X0} y1="6" x2={X0} y2="144" stroke="currentColor" strokeOpacity=".3" />
      <path d={CURVE} fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1={sx(x1)} y1={sy(line(x1))} x2={sx(x2)} y2={sy(line(x2))} stroke="#d6483c" strokeWidth="1.6" strokeDasharray="5 4" />
      <circle cx={sx(a)} cy={sy(b)} r="4" fill="#d6483c" />
    </svg>
  </>;
}
