"use client";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { CATALOG } from "@/lib/editor/board/model";
import s from "./landing.module.css";

const GROUPS = [...new Set(CATALOG.map((c) => c.g))];
const norm = (v: string) => v.toLowerCase().replace(/ё/g, "е").replace(/^\/+/, "").trim();

function Hl({ text, q }: { text: string; q: string }) {
  const at = q ? norm(text).indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + q.length)}</mark>{text.slice(at + q.length)}</>;
}

/** All widgets of the editor, searchable the way the «/» menu works. «/» anywhere on the page jumps here. */
export function Catalog() {
  const [query, setQuery] = useState("");
  const q = norm(useDeferredValue(query));
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || el.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hit = (c: (typeof CATALOG)[number]) => !q || norm(c.name).includes(q) || norm(c.about).includes(q);
  const count = CATALOG.filter(hit).length;

  return <>
    <div className={s.catHead}>
      <div>
        <h2 id="cat-h">{CATALOG.length} виджетов, и все двигаются</h2>
        <p className={s.sub}>Наберите «/» в любой строке, и виджет встанет прямо под ней. Попробуйте здесь.</p>
      </div>
      <label className={s.slash}>
        <kbd>/</kbd>
        <input ref={input} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="таблица, график, таймер…" aria-label="Найти виджет" autoComplete="off" />
      </label>
    </div>
    <div className={s.cat} aria-live="polite">
      {count === 0 && <p className={s.empty}>Такого виджета нет. Попробуйте «карточки» или «схема».</p>}
      {GROUPS.map((g) => {
        const items = CATALOG.filter((c) => c.g === g);
        const found = items.filter(hit).length;
        return (
          <div key={g} className={found ? undefined : s.dim}>
            <h3><span>{g}</span><span>{q ? `${found} из ${items.length}` : items.length}</span></h3>
            <ul>
              {items.filter(hit).map((c) => (
                <li key={c.t}><i aria-hidden="true">{c.ico}</i><span><b><Hl text={c.name} q={q} /></b><small>{c.about}</small></span></li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  </>;
}
