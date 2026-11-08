"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import { toTex } from "@/lib/editor/board/math";
import s from "./landing.module.css";

const EXAMPLES: [string, string][] = [
  ["дробь", "(x+1)/2"],
  ["корень", "c = sqrt(a^2+b^2)"],
  ["предел", "lim(x->0) sin(x)/x = 1"],
  ["сумма", "сумма(k=1, n) k = n(n+1)/2"],
  ["интеграл", "интеграл(0, 1) x^2 dx = 1/3"],
];

type Out = { html: string } | { error: string } | { empty: true };
function render(src: string): Out {
  const tex = toTex(src);
  if (!tex) return { empty: true };
  try {
    return { html: katex.renderToString(tex, { throwOnError: true, displayMode: true, trust: false, maxExpand: 500 }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^KaTeX parse error:\s*/, "") : "не получилось разобрать" };
  }
}

/**
 * The editor's formula input on the landing: calculator-style text in, rendered formula out, same parser.
 * While the visitor hasn't touched it, it types the examples itself; the formula re-renders on every key.
 */
export function FormulaDemo() {
  const [src, setSrc] = useState(EXAMPLES[0][1]);
  const [auto, setAuto] = useState(true);
  const [typing, setTyping] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let n = 0, i = 0, t = 0, visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    if (box.current) io.observe(box.current);
    const step = () => {
      if (!visible) { t = window.setTimeout(step, 400); return; }
      const target = EXAMPLES[n][1];
      if (i === 0) setTyping(true);
      i++;
      setSrc(target.slice(0, i));
      if (i < target.length) { t = window.setTimeout(step, 55 + Math.random() * 60); return; }
      setTyping(false);
      n = (n + 1) % EXAMPLES.length; i = 0;
      t = window.setTimeout(step, 2600);
    };
    t = window.setTimeout(step, 2200);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [auto]);

  // While the demo types, half-typed input is often invalid: show the longest typed part that renders.
  const shown = useMemo(() => {
    const out = render(src);
    if ("html" in out || !typing) return out;
    for (let j = src.length - 1; j > 0; j--) {
      const prev = render(src.slice(0, j));
      if ("html" in prev) return prev;
    }
    return out;
  }, [src, typing]);
  const take = (v: string) => { setAuto(false); setTyping(false); setSrc(v.slice(0, 200)); };

  return (
    <div className={s.fxDemo} ref={box}>
      <label className={s.fxIn}>
        <span>Вы пишете</span>
        <input value={src} onChange={(e) => take(e.target.value)} onFocus={() => { setAuto(false); setTyping(false); }}
          spellCheck={false} autoComplete="off" aria-describedby="fx-out" />
      </label>
      <div className={s.fxOut} id="fx-out" aria-live={auto ? "off" : "polite"}>
        {"html" in shown ? <span key={shown.html.length} dangerouslySetInnerHTML={{ __html: shown.html }} />
          : "error" in shown ? <span className={s.fxErr}>Ошибка в формуле: {shown.error}</span>
          : <span className={s.fxErr}>Напишите формулу, например (x+1)/2</span>}
      </div>
      <div className={s.chips} role="group" aria-label="Примеры формул">
        {EXAMPLES.map(([name, f]) => (
          <button key={name} type="button" className={s.chip} aria-pressed={f === src} onClick={() => take(f)}>{name}</button>
        ))}
      </div>
    </div>
  );
}
