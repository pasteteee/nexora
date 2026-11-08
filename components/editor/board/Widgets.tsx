"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ImageView } from "@/components/editor/elements/ImageView";
import { SourceCard } from "@/components/editor/elements/SourceCard";
import { compileFn, fmtNum, niceStep, toTex } from "@/lib/editor/board/math";
import { NOTE_COLORS, NOTE_LIMIT, dataOf, randomIn, linesOf, plural, uid, type DiagramNode, type DiagramShape, type NoteWidget, type Widget, type WidgetData, type WidgetType } from "@/lib/editor/board/model";
import { AutoText } from "./AutoText";
import { MathLine } from "./MathLine";
import { Menu, Popover } from "./Popover";
import { TextWidget } from "./TextWidget";
import { useBoard, type BoardApi } from "./context";
import s from "./board.module.css";

export type Action = { label: string; title?: string; run(): void; swatch?: string; on?: boolean };
export type WidgetProps = { w: Widget; form: string | null; setForm(f: string | null): void; frame: HTMLElement | null };
type Def = { View(p: WidgetProps): ReactNode; actions?(w: Widget, api: BoardApi, setForm: (f: string) => void, form: string | null): Action[]; card?: boolean };

function useData<T extends NoteWidget>(w: Widget, t: T): [WidgetData[T], (d: WidgetData[T]) => void, boolean] {
  const api = useBoard();
  return [dataOf(w.el, t), (d) => api.setData(w, t, d), api.edit];
}
const DAY = 86_400_000;

/* ---------------- formula ---------------- */
function FormulaView({ w }: WidgetProps) {
  const api = useBoard();
  const src = String(w.el.content.src ?? w.el.content.latex ?? "");
  return <MathLine src={src} lid="formula" edit={api.edit} onChange={(v) => api.setContent(w.id, { src: v, latex: toTex(v) })} onDone={() => api.focus({ id: w.id })} onRemove={() => api.remove(w.id)} />;
}

/* ---------------- plot ---------------- */
function PlotView({ w, form, setForm, frame }: WidgetProps) {
  const [d, set, edit] = useData(w, "plot");
  const svg = useMemo(() => {
    const f1 = compileFn(d.f1), f2 = d.f2 ? compileFn(d.f2) : null;
    let a = +d.xmin, b = +d.xmax;
    if (!(b > a)) { a = -3; b = 3; }
    const W = 320, H = 200, pad = 22, N = 160, ys: number[] = [], p1: [number, number][] = [], p2: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const x = a + (b - a) * i / N, y1 = f1 ? f1(x) : NaN, y2 = f2 ? f2(x) : NaN;
      p1.push([x, y1]); p2.push([x, y2]);
      if (Number.isFinite(y1)) ys.push(y1);
      if (Number.isFinite(y2)) ys.push(y2);
    }
    ys.sort((p, q) => p - q);
    let lo = ys.length ? ys[Math.floor(ys.length * 0.02)] : -1, hi = ys.length ? ys[Math.ceil(ys.length * 0.98) - 1] : 1;
    lo = Math.min(lo, 0); hi = Math.max(hi, 0); if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    const m = (hi - lo) * 0.08; lo -= m; hi += m;
    const X = (x: number) => pad + (x - a) / (b - a) * (W - 2 * pad), Y = (y: number) => H - pad - (y - lo) / (hi - lo) * (H - 2 * pad);
    const path = (pts: [number, number][]) => { let out = "", pen = false; for (const [x, y] of pts) { if (!Number.isFinite(y) || y < lo - (hi - lo) || y > hi + (hi - lo)) { pen = false; continue; } out += `${pen ? "L" : "M"}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`; pen = true; } return out; };
    const sx = niceStep(b - a), sy = niceStep(hi - lo), ticks: ReactNode[] = [];
    for (let t = Math.ceil(a / sx) * sx; t <= b + 1e-9; t += sx) if (Math.abs(t) > 1e-9) ticks.push(<g key={`x${t}`}><line className={s.gr} x1={X(t)} y1={pad / 2} x2={X(t)} y2={H - pad / 2} /><text x={X(t)} y={Math.min(H - 4, Y(0) + 13)} textAnchor="middle">{fmtNum(t)}</text></g>);
    for (let t = Math.ceil(lo / sy) * sy; t <= hi + 1e-9; t += sy) if (Math.abs(t) > 1e-9) ticks.push(<g key={`y${t}`}><line className={s.gr} x1={pad / 2} y1={Y(t)} x2={W - pad / 2} y2={Y(t)} /><text x={Math.max(12, X(0) - 5)} y={Y(t) + 3.5} textAnchor="end">{fmtNum(t)}</text></g>);
    return { ok1: !!f1, ok2: !!f2, el: <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`График ${d.f1}`}>{ticks}
      <line className={s.ax} x1={pad / 2} y1={Y(0)} x2={W - pad / 2} y2={Y(0)} /><line className={s.ax} x1={X(0)} y1={pad / 2} x2={X(0)} y2={H - pad / 2} />
      {f2 && <path className={s.f2} d={path(p2)} />}{f1 && <path className={s.f1} d={path(p1)} />}</svg> };
  }, [d.f1, d.f2, d.xmin, d.xmax]);
  return <figure className={s.plotFig}>
    <div className={s.plotSvg} onClick={() => edit && setForm("plot")}>{svg.el}</div>
    <figcaption className={s.plotLeg}>
      {svg.ok1 ? <span data-k="1">y = {d.f1}</span> : <span data-err>Не получилось прочитать: {d.f1}</span>}
      {d.f2 && (svg.ok2 ? <span data-k="2">y = {d.f2}</span> : <span data-err>{d.f2}?</span>)}
    </figcaption>
    {form === "plot" && <Popover anchor={frame} onClose={() => setForm(null)} label="Функция графика">
      <div className={s.form}>
        <label>y = <input autoFocus value={d.f1} onChange={(e) => set({ ...d, f1: e.target.value })} /></label>
        <label>и y = <input value={d.f2} placeholder="вторая, необязательно" onChange={(e) => set({ ...d, f2: e.target.value })} /></label>
        <label>x от <input type="number" value={d.xmin} onChange={(e) => set({ ...d, xmin: +e.target.value })} /> до <input type="number" value={d.xmax} onChange={(e) => set({ ...d, xmax: +e.target.value })} /></label>
        <p className={s.hint}>Как в калькуляторе: x^2, 2x - 1, sin(x), sqrt(x), |x|.</p>
      </div>
    </Popover>}
  </figure>;
}

/* ---------------- kanban ---------------- */
function KanbanView({ w }: WidgetProps) {
  const [d, set, edit] = useData(w, "kanban");
  const api = useBoard();
  const drag = useRef<{ card: string; from: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const focusCard = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusCard.current) return;
    root.current?.querySelector<HTMLTextAreaElement>(`[data-card="${focusCard.current}"] textarea`)?.focus();
    focusCard.current = null;
  }, [d]);
  const setCol = (id: string, f: (c: WidgetData["kanban"]["cols"][number]) => WidgetData["kanban"]["cols"][number]) => set({ ...d, cols: d.cols.map((c) => c.id === id ? f(c) : c) });
  return <div ref={root} className={s.kbWrap}>
    <input className={s.title} value={d.title} readOnly={!edit} placeholder="Название доски" aria-label="Название доски" onChange={(e) => set({ ...d, title: e.target.value })} />
    <div className={s.kb}>
      {d.cols.map((col) => <div key={col.id} className={s.kbCol} data-over={over === col.id || undefined}
        onDragOver={(e) => { if (!drag.current) return; e.preventDefault(); setOver(col.id); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
        onDrop={(e) => {
          const dc = drag.current; if (!dc) return;
          e.preventDefault(); setOver(null); drag.current = null;
          const cards = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-card]")].filter((n) => n.dataset.card !== dc.card);
          let idx = cards.length;
          for (let i = 0; i < cards.length; i++) { const r = cards[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { idx = i; break; } }
          const card = d.cols.find((c) => c.id === dc.from)?.cards.find((c) => c.id === dc.card);
          if (!card) return;
          const cols = d.cols.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== dc.card) }));
          const target = cols.find((c) => c.id === col.id)!;
          target.cards.splice(idx, 0, card);
          set({ ...d, cols });
        }}>
        <div className={s.kbH}>
          <input value={col.title} readOnly={!edit} aria-label="Название колонки" onChange={(e) => setCol(col.id, (c) => ({ ...c, title: e.target.value }))} />
          <span className={s.kbN}>{col.cards.length}</span>
          {edit && !col.cards.length && d.cols.length > 1 && <button type="button" className={s.del} aria-label="Удалить колонку" title="Удалить колонку" onClick={() => set({ ...d, cols: d.cols.filter((c) => c.id !== col.id) })}>×</button>}
        </div>
        <div className={s.kbList}>
          {col.cards.map((card) => <div key={card.id} className={s.kbCard} data-card={card.id} draggable={edit}
            onDragStart={(e) => { drag.current = { card: card.id, from: col.id }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", card.text); e.currentTarget.dataset.moving = ""; }}
            onDragEnd={(e) => { delete e.currentTarget.dataset.moving; drag.current = null; setOver(null); }}>
            <AutoText value={card.text} readOnly={!edit} placeholder="Задача" aria-label="Задача"
              onChange={(e) => setCol(col.id, (c) => ({ ...c, cards: c.cards.map((x) => x.id === card.id ? { ...x, text: e.target.value } : x) }))}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }} />
            {edit && <button type="button" className={s.del} title="Удалить карточку" aria-label="Удалить карточку" onClick={() => setCol(col.id, (c) => ({ ...c, cards: c.cards.filter((x) => x.id !== card.id) }))}>×</button>}
          </div>)}
        </div>
        {edit && <button type="button" className={s.kbAdd} onClick={() => { const id = uid(); setCol(col.id, (c) => ({ ...c, cards: [...c.cards, { id, text: "" }] })); focusCard.current = id; }}>+ Карточка</button>}
      </div>)}
    </div>
    {void api}
  </div>;
}

/* ---------------- table ---------------- */
function TableView({ w }: WidgetProps) {
  const [d, set, edit] = useData(w, "table");
  const root = useRef<HTMLTableElement>(null);
  const focusCell = useRef<string | null>(null);
  const focusNow = () => { if (focusCell.current) root.current?.querySelector<HTMLTextAreaElement>(`[data-cell="${focusCell.current}"]`)?.focus(); focusCell.current = null; };
  useEffect(focusNow, [d]);
  return <div className={s.tbl}><table ref={root}><tbody>
    {d.rows.map((r, ri) => <tr key={ri}>{r.map((cell, ci) => {
      const Cell = ri === 0 ? "th" : "td";
      return <Cell key={ci}><AutoText value={cell} readOnly={!edit} data-cell={`${ri}:${ci}`} aria-label={`Ячейка ${ri + 1}, ${ci + 1}`}
        onChange={(e) => set({ rows: d.rows.map((row, i) => i !== ri ? row : row.map((c, j) => j === ci ? e.target.value : c)) })}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey) return;
          e.preventDefault();
          focusCell.current = `${ri + 1}:${ci}`;
          if (ri + 1 >= d.rows.length) set({ rows: [...d.rows, d.rows[0].map(() => "")] }); else focusNow();
        }} /></Cell>;
    })}</tr>)}
  </tbody></table></div>;
}

/* ---------------- checklist ---------------- */
function ChecklistView({ w }: WidgetProps) {
  const [d, set, edit] = useData(w, "checklist");
  const root = useRef<HTMLDivElement>(null);
  const focusItem = useRef<string | null>(null);
  useEffect(() => {
    if (!focusItem.current) return;
    const n = root.current?.querySelector<HTMLTextAreaElement>(`[data-item="${focusItem.current}"]`);
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    focusItem.current = null;
  }, [d]);
  const done = d.items.filter((i) => i.done).length;
  return <div ref={root} className={s.stack}>
    <input className={s.title} value={d.title} readOnly={!edit} placeholder="Название" aria-label="Название списка" onChange={(e) => set({ ...d, title: e.target.value })} />
    <div className={s.progress} role="progressbar" aria-valuemin={0} aria-valuemax={d.items.length} aria-valuenow={done} aria-label="Выполнено">
      <i style={{ ["--p" as string]: d.items.length ? done / d.items.length : 0 }} /><span>{done} из {d.items.length}</span>
    </div>
    <div className={s.cl}>
      {d.items.map((it, idx) => <div key={it.id} className={s.clI} data-done={it.done || undefined}>
        <input type="checkbox" checked={it.done} disabled={!edit} aria-label="Выполнено" onChange={(e) => set({ ...d, items: d.items.map((x) => x.id === it.id ? { ...x, done: e.target.checked } : x) })} />
        <AutoText value={it.text} readOnly={!edit} data-item={it.id} placeholder="Пункт" aria-label="Пункт"
          onChange={(e) => set({ ...d, items: d.items.map((x) => x.id === it.id ? { ...x, text: e.target.value } : x) })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const n = { id: uid(), text: "", done: false }; set({ ...d, items: [...d.items.slice(0, idx + 1), n, ...d.items.slice(idx + 1)] }); focusItem.current = n.id; }
            if (e.key === "Backspace" && !e.currentTarget.value && d.items.length > 1) { e.preventDefault(); set({ ...d, items: d.items.filter((x) => x.id !== it.id) }); focusItem.current = d.items[Math.max(0, idx - 1)].id; }
          }} />
      </div>)}
    </div>
  </div>;
}

/* ---------------- flashcards ---------------- */
function FlashView({ w, form, setForm, frame }: WidgetProps) {
  const [d, set] = useData(w, "flash");
  const [i, setI] = useState(0), [back, setBack] = useState(false);
  const cards = d.cards.length ? d.cards : [{ q: "Вопрос", a: "Ответ" }];
  const k = Math.min(i, cards.length - 1), c = cards[k];
  const [draft, setDraft] = useState("");
  return <div className={s.stack}>
    <button type="button" className={s.fc} data-back={back || undefined} aria-label={`${back ? `Ответ: ${c.a}` : `Вопрос: ${c.q}`}. Перевернуть`} onClick={() => setBack(!back)}>
      <small>{back ? "Ответ" : "Вопрос"}</small><span>{back ? c.a : c.q}</span><em>{back ? "Нажмите, чтобы вернуть вопрос" : "Нажмите, чтобы увидеть ответ"}</em>
    </button>
    <div className={s.fcNav}>
      <button type="button" aria-label="Предыдущая карточка" onClick={() => { setI((k - 1 + cards.length) % cards.length); setBack(false); }}>←</button>
      <span>{k + 1} из {cards.length}</span>
      <button type="button" aria-label="Следующая карточка" onClick={() => { setI((k + 1) % cards.length); setBack(false); }}>→</button>
    </div>
    {form === "flash" && <Popover anchor={frame} onClose={() => setForm(null)} label="Карточки">
      <div className={s.form}>
        <label className={s.col}>Каждая строка: вопрос | ответ
          <textarea autoFocus rows={6} value={draft || d.cards.map((x) => `${x.q} | ${x.a}`).join("\n")}
            onChange={(e) => {
              setDraft(e.target.value);
              set({ i: 0, cards: e.target.value.split("\n").filter((x) => x.trim()).map((x) => { const p = x.split("|"); return { q: p[0].trim(), a: p.slice(1).join("|").trim() }; }) });
              setBack(false);
            }} />
        </label>
      </div>
    </Popover>}
  </div>;
}

/* ---------------- quiz ---------------- */
function QuizView({ w, form, setForm, frame }: WidgetProps) {
  const [d, set] = useData(w, "quiz");
  const [picked, setPicked] = useState<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  return <div className={s.stack}>
    <p className={s.qzQ}>{d.q}</p>
    <div className={s.qz}>{d.opts.map((o, i) => <button key={i} type="button" disabled={picked !== null}
      data-res={picked === null ? undefined : i === d.right ? "right" : i === picked ? "wrong" : undefined} onClick={() => setPicked(i)}>{o}</button>)}</div>
    <p className={s.qzRes} data-ok={picked === null ? undefined : picked === d.right} aria-live="polite">{picked === null ? "" : picked === d.right ? "Верно" : "Не совсем. Правильный ответ подсвечен"}</p>
    {picked !== null && <button type="button" className={s.link} onClick={() => setPicked(null)}>Пройти ещё раз</button>}
    {form === "quiz" && <Popover anchor={frame} onClose={() => { setForm(null); setDraft(null); }} label="Вопрос самопроверки">
      <div className={s.form}>
        <label className={s.col}>Вопрос<input autoFocus value={d.q} onChange={(e) => set({ ...d, q: e.target.value })} /></label>
        <label className={s.col}>Варианты, по одному в строке. Верный отметьте звёздочкой *
          <textarea rows={5} value={draft ?? d.opts.map((o, i) => (i === d.right ? "*" : "") + o).join("\n")} onChange={(e) => {
            setDraft(e.target.value);
            const rows = e.target.value.split("\n").filter((x) => x.trim());
            set({ q: d.q, right: Math.max(0, rows.findIndex((x) => x.trim().startsWith("*"))), opts: rows.map((x) => x.trim().replace(/^\*\s*/, "")) });
            setPicked(null);
          }} />
        </label>
      </div>
    </Popover>}
  </div>;
}

/* ---------------- deadlines ---------------- */
function DeadlinesView({ w }: WidgetProps) {
  const [d, set, edit] = useData(w, "deadlines");
  const [title, setTitle] = useState(""), [date, setDate] = useState("");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return <div className={s.stack}>
    <ul className={s.dl}>
      {[...d.items].sort((a, b) => a.date.localeCompare(b.date)).map((it) => {
        const dt = new Date(`${it.date}T00:00:00`), days = Math.round((dt.getTime() - today.getTime()) / DAY);
        const tone = days < 0 ? "late" : days <= 3 ? "soon" : "ok";
        const when = days < 0 ? `просрочено на ${-days} ${plural(-days)}` : days === 0 ? "сегодня" : days === 1 ? "завтра" : `через ${days} ${plural(days)}`;
        return <li key={it.id} className={s.dlI} data-tone={tone}>
          <span className={s.dlT}>{it.title}</span>
          <span className={s.dlD}>{Number.isNaN(dt.getTime()) ? it.date : dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
          <span className={s.chip}>{when}</span>
          {edit && <button type="button" className={s.del} aria-label="Удалить срок" onClick={() => set({ items: d.items.filter((x) => x.id !== it.id) })}>×</button>}
        </li>;
      })}
      {!d.items.length && <li className={s.empty}>Сроков пока нет.{edit ? " Добавьте первый ниже." : ""}</li>}
    </ul>
    {edit && <form className={s.dlForm} onSubmit={(e) => {
      e.preventDefault();
      const t = title.trim();
      const f = e.currentTarget.elements;
      if (!t) { (f[0] as HTMLElement).focus(); return; }
      if (!date) { (f[1] as HTMLElement).focus(); return; }
      set({ items: [...d.items, { id: uid(), title: t, date }] }); setTitle(""); setDate("");
    }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Что сдать" aria-label="Что сдать" />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Срок" />
      <button type="submit">Добавить</button>
    </form>}
  </div>;
}

/* ---------------- timer ---------------- */
function TimerView({ w, form, setForm, frame }: WidgetProps) {
  const [d, set] = useData(w, "timer");
  const [mode, setMode] = useState<"work" | "rest">("work");
  const [left, setLeft] = useState(d.work * 60);
  const [run, setRun] = useState(false);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setLeft((v) => {
      if (v > 1) return v - 1;
      setMode((m) => {
        const next = m === "work" ? "rest" : "work";
        setLeft((next === "work" ? d.work : d.rest) * 60);
        return next;
      });
      return 0;
    }), 1000);
    return () => clearInterval(t);
  }, [run, d.work, d.rest]);
  const total = (mode === "work" ? d.work : d.rest) * 60 || 1, C = 2 * Math.PI * 52;
  const reset = (work = d.work) => { setRun(false); setStarted(false); setMode("work"); setLeft(work * 60); };
  return <div className={s.tmWrap} data-rest={mode === "rest" || undefined}>
    <div className={s.tm}>
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle className={s.tmBg} cx="60" cy="60" r="52" /><circle className={s.tmFg} cx="60" cy="60" r="52" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - left / total) }} /></svg>
      <div className={s.tmC} role="timer" aria-live="off"><b>{String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</b><small>{mode === "work" ? "Работа" : "Перерыв"}</small></div>
    </div>
    <div className={s.tmB}>
      <button type="button" onClick={() => { setRun(!run); setStarted(true); }}>{run ? "Пауза" : started ? "Продолжить" : "Старт"}</button>
      <button type="button" onClick={() => reset()}>Сброс</button>
    </div>
    {form === "timer" && <Popover anchor={frame} onClose={() => setForm(null)} label="Настройка таймера">
      <div className={s.form}>
        <label>Работа <input type="number" min={1} max={180} value={d.work} onChange={(e) => { const v = Math.max(1, Math.min(180, +e.target.value || 1)); set({ ...d, work: v }); reset(v); }} /> мин</label>
        <label>Перерыв <input type="number" min={1} max={60} value={d.rest} onChange={(e) => set({ ...d, rest: Math.max(1, Math.min(60, +e.target.value || 1)) })} /> мин</label>
      </div>
    </Popover>}
  </div>;
}

/* ---------------- callout ---------------- */
function CalloutView({ w }: WidgetProps) {
  const [d, set, edit] = useData(w, "callout");
  return <AutoText className={s.co} value={d.text} readOnly={!edit} placeholder="Важная мысль" aria-label="Выноска" onChange={(e) => set({ ...d, text: e.target.value })} />;
}

/* ---------------- image ---------------- */
function ImageWidget({ w }: WidgetProps) {
  const api = useBoard();
  return <div className={s.stack}>
    <ImageView el={w.el} />
    <input className={s.cap} value={String(w.el.content.caption ?? "")} readOnly={!api.edit} placeholder={api.edit ? "Подпись" : ""} aria-label="Подпись к изображению"
      onChange={(e) => api.setContent(w.id, { caption: e.target.value })} />
  </div>;
}

/* ---------------- code ---------------- */
function CodeView({ w }: WidgetProps) {
  const [d, set, edit] = useData(w, "code");
  return <div className={s.stack}>
    <input className={s.codeL} value={d.lang} readOnly={!edit} aria-label="Язык" onChange={(e) => set({ ...d, lang: e.target.value })} />
    <AutoText className={s.codePre} value={d.code} readOnly={!edit} placeholder="Вставьте или напишите код" aria-label="Код"
      onChange={(e) => set({ ...d, code: e.target.value })}
      onKeyDown={(e) => {
        if (e.key !== "Tab" || e.shiftKey) return;
        e.preventDefault();
        const n = e.currentTarget, a = n.selectionStart, b = n.selectionEnd, v = `${n.value.slice(0, a)}    ${n.value.slice(b)}`;
        set({ ...d, code: v });
        requestAnimationFrame(() => n.setSelectionRange(a + 4, a + 4));
      }} />
  </div>;
}

/* ---------------- table of contents ---------------- */
function TocView() {
  const api = useBoard();
  const heads = api.ordered().filter((x) => x.type === "text").flatMap((x) => linesOf(x.el).filter((l) => /^h[123]$/.test(l.t) && l.text).map((l) => ({ w: x.id, l })));
  return <div className={s.stack}>
    <div className={s.tocH}>Содержание</div>
    <ol className={s.tocList}>
      {heads.map(({ w, l }) => <li key={l.id} data-line={l.t}><a href={`#${l.id}`} onClick={(e) => {
        e.preventDefault();
        const t = document.querySelector<HTMLElement>(`[data-wid="${w}"] [data-lid="${l.id}"]`);
        if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.focus({ preventScroll: true }); }
      }}>{l.text}</a></li>)}
      {!heads.length && <li className={s.empty}>Добавьте заголовки, и они появятся здесь</li>}
    </ol>
  </div>;
}

function SourceView({ w }: WidgetProps) { return <SourceCard el={w.el} />; }

/* ---------------- note: sticker, six colours, up to 500 characters ---------------- */
function NoteView({ w }: WidgetProps) {
  const api = useBoard();
  const text = String(w.el.content.text ?? "");
  return <>
    <AutoText className={s.noteT} value={text} readOnly={!api.edit} placeholder="Заметка" aria-label="Заметка" maxLength={NOTE_LIMIT}
      onChange={(e) => api.setContent(w.id, { text: e.target.value.slice(0, NOTE_LIMIT) })}
      onBeforeInput={(e) => { if (text.length >= NOTE_LIMIT && (e.nativeEvent as InputEvent).inputType?.startsWith("insert")) api.notify(w.id, "В заметке до 500 знаков"); }} />
    {text.length >= NOTE_LIMIT - 100 && <small className={s.noteN}>{text.length} / {NOTE_LIMIT}</small>}
  </>;
}

/* ---------------- diagram: nodes, shapes and arrows ---------------- */
const SHAPES: [DiagramShape, string][] = [["node", "Узел"], ["rect", "Прямоугольник"], ["ellipse", "Эллипс"], ["rhombus", "Ромб"], ["triangle", "Треугольник"]];
const SIZE: Record<DiagramShape, [number, number]> = { node: [128, 46], rect: [110, 64], ellipse: [110, 64], rhombus: [100, 76], triangle: [100, 76] };
function DiagramView({ w, form, setForm, frame }: WidgetProps) {
  const [d, set, edit] = useData(w, "diagram");
  const api = useBoard();
  const area = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const [sel, setSel] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [labelEdit, setLabelEdit] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ id: string; cx: number; cy: number } | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const linking = form === "link";
  useEffect(() => {
    const n = area.current; if (!n) return;
    const ro = new ResizeObserver(() => setWidth(n.clientWidth || 400));
    ro.observe(n);
    return () => ro.disconnect();
  }, []);
  const h = height ?? d.h ?? 260;
  const nodes = d.nodes.map((n) => moving?.id === n.id ? { ...n, cx: moving.cx, cy: moving.cy } : n);
  const rect = (n: DiagramNode) => { const [sw, sh] = SIZE[n.kind] ?? SIZE.node, cx = n.cx * width; return { x: cx - sw / 2, y: n.cy - sh / 2, w: sw, h: sh, cx, cy: n.cy }; };
  const clip = (r: ReturnType<typeof rect>, tx: number, ty: number): [number, number] => {
    const dx = tx - r.cx, dy = ty - r.cy;
    if (!dx && !dy) return [r.cx, r.cy];
    const k = Math.min(Math.abs((r.w / 2 + 4) / (dx || 1e-9)), Math.abs((r.h / 2 + 4) / (dy || 1e-9)));
    return [r.cx + dx * k, r.cy + dy * k];
  };
  const addNode = (kind: DiagramShape) => {
    const n: DiagramNode = { id: uid(), kind, cx: randomIn(0.2, 0.8), cy: randomIn(50, 50 + Math.max(40, h - 100)), label: kind === "node" ? "Узел" : "" };
    set({ ...d, nodes: [...d.nodes, n] }); setSel(n.id);
  };
  const nodeDown = (e: React.PointerEvent, n: DiagramNode) => {
    if (!edit || labelEdit === n.id) return;
    e.preventDefault(); e.stopPropagation(); area.current?.focus();
    if (linking) {
      if (!from) { setFrom(n.id); return; }
      if (from !== n.id) set({ ...d, edges: [...d.edges, { id: uid(), from, to: n.id }] });
      setFrom(null); setForm(null); return;
    }
    setSel(n.id);
    const sx = e.clientX, sy = e.clientY, [sw, sh] = SIZE[n.kind] ?? SIZE.node;
    let last: { cx: number; cy: number } | null = null;
    const mv = (ev: PointerEvent) => {
      if (!last && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return;
      last = { cx: Math.max(sw / 2 / width, Math.min(1 - sw / 2 / width, n.cx + (ev.clientX - sx) / width)), cy: Math.max(sh / 2, Math.min(h - sh / 2, n.cy + ev.clientY - sy)) };
      setMoving({ id: n.id, ...last });
    };
    const up = () => {
      document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up);
      if (last) { const p = last; set({ ...d, nodes: d.nodes.map((x) => x.id === n.id ? { ...x, ...p } : x) }); }
      setMoving(null);
    };
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  };
  const gripDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const sy = e.clientY, h0 = d.h ?? 260;
    let v = h0;
    const mv = (ev: PointerEvent) => { v = Math.max(160, Math.min(900, h0 + ev.clientY - sy)); setHeight(v); };
    const up = () => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); setHeight(null); if (v !== h0) set({ ...d, h: v }); };
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  };
  const marker = `ar-${w.id}`;
  const hint = linking ? (from ? "Теперь нажмите на второй узел" : "Нажмите на узел, от которого идёт стрелка") : d.nodes.length ? "" : edit ? "Добавьте узел или фигуру кнопками сверху" : "";
  return <div className={s.stack}>
    <div ref={area} className={s.dg} style={{ height: h }} tabIndex={edit ? 0 : -1} aria-label="Схема. Выберите узел и нажмите Delete, чтобы удалить"
      onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}
      onKeyDown={(e) => {
        if (!edit || !sel || labelEdit || (e.key !== "Delete" && e.key !== "Backspace")) return;
        e.preventDefault();
        set({ ...d, nodes: d.nodes.filter((n) => n.id !== sel), edges: d.edges.filter((x) => x.id !== sel && x.from !== sel && x.to !== sel) });
        setSel(null);
      }}>
      <svg className={s.dgSvg} aria-hidden="true">
        <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className={s.dgHead} /></marker></defs>
        {d.edges.map((ed) => {
          const a = nodes.find((n) => n.id === ed.from), b = nodes.find((n) => n.id === ed.to);
          if (!a || !b) return null;
          const ra = rect(a), rb = rect(b), p1 = clip(ra, rb.cx, rb.cy), p2 = clip(rb, ra.cx, ra.cy);
          return <line key={ed.id} className={s.dgEdge} data-sel={sel === ed.id || undefined} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} markerEnd={`url(#${marker})`}
            onPointerDown={() => edit && setSel(ed.id)} />;
        })}
      </svg>
      {nodes.map((n) => {
        const r = rect(n);
        return <div key={n.id} className={s.dgN} data-kind={n.kind} data-sel={sel === n.id || undefined} data-from={from === n.id || undefined} data-color={n.color}
          style={{ left: r.x, top: r.y, width: r.w, height: r.h }} onPointerDown={(e) => nodeDown(e, n)} onDoubleClick={() => edit && setLabelEdit(n.id)}>
          {labelEdit === n.id
            ? <input autoFocus className={s.dgL} value={n.label} aria-label="Подпись узла" onChange={(e) => set({ ...d, nodes: d.nodes.map((x) => x.id === n.id ? { ...x, label: e.target.value } : x) })}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }} onBlur={() => setLabelEdit(null)} />
            : <span className={s.dgL}>{n.label}</span>}
        </div>;
      })}
      {hint && <div className={s.dgHint}>{hint}</div>}
    </div>
    {edit && <div className={s.dgGrip} title="Потяните, чтобы изменить высоту" onPointerDown={gripDown} />}
    {form === "shape" && <Menu anchor={frame} title="Фигура" onClose={() => setForm(null)} items={SHAPES.slice(1).map(([k, label]) => ({ label, run: () => addNode(k) }))} />}
    {form === "color" && (sel && d.nodes.some((n) => n.id === sel)
      ? <Menu anchor={frame} title="Цвет узла" onClose={() => setForm(null)} items={NOTE_COLORS.map(([c, label]) => ({ label, run: () => set({ ...d, nodes: d.nodes.map((x) => x.id === sel ? { ...x, color: c } : x) }) }))} />
      : <NoticeOnce onShow={() => { api.notify(w.id, "Сначала выберите узел"); setForm(null); }} />)}
    {form === "add-node" && <NoticeOnce onShow={() => { addNode("node"); setForm(null); }} />}
  </div>;
}
function NoticeOnce({ onShow }: { onShow(): void }) {
  const done = useRef(false);
  useEffect(() => { if (!done.current) { done.current = true; onShow(); } });
  return null;
}

const set = <T extends NoteWidget>(api: BoardApi, w: Widget, t: T, f: (d: WidgetData[T]) => WidgetData[T]) => api.setData(w, t, f(dataOf(w.el, t)));

export const WIDGETS: Record<WidgetType, Def> = {
  note: { View: NoteView, actions: (w, api) => NOTE_COLORS.map(([c, label]) => ({ label, title: `Цвет: ${label}`, swatch: c, on: (w.el.style.color ?? "yellow") === c, run: () => api.setStyle(w.id, { color: c }) })) },
  diagram: { View: DiagramView, card: true, actions: (_w, _a, open, form) => [
    { label: "+ Узел", title: "Добавить узел схемы", run: () => open("add-node") },
    { label: "+ Фигура", title: "Прямоугольник, эллипс, ромб, треугольник", run: () => open("shape") },
    { label: "→ Стрелка", title: "Соединить два узла", on: form === "link", run: () => open(form === "link" ? "" : "link") },
    { label: "Цвет", title: "Цвет выбранного узла", run: () => open("color") },
  ] },
  fragment: { View: SourceView, card: true },
  text: { View: ({ w }) => <TextWidget w={w} /> },
  formula: { View: FormulaView },
  plot: { View: PlotView, card: true, actions: (_w, _a, open) => [{ label: "Изменить функцию", run: () => open("plot") }] },
  kanban: { View: KanbanView, card: true, actions: (w, api) => [{ label: "+ колонка", run: () => set(api, w, "kanban", (d) => ({ ...d, cols: [...d.cols, { id: uid(), title: "Новая", cards: [] }] })) }] },
  table: { View: TableView, card: true, actions: (w, api) => [
    { label: "+ строка", run: () => set(api, w, "table", (d) => ({ rows: [...d.rows, d.rows[0].map(() => "")] })) },
    { label: "+ столбец", run: () => set(api, w, "table", (d) => ({ rows: d.rows.map((r) => [...r, ""]) })) },
    { label: "− строка", title: "Удалить последнюю строку", run: () => set(api, w, "table", (d) => d.rows.length > 2 ? { rows: d.rows.slice(0, -1) } : d) },
    { label: "− столбец", title: "Удалить последний столбец", run: () => set(api, w, "table", (d) => d.rows[0].length > 1 ? { rows: d.rows.map((r) => r.slice(0, -1)) } : d) },
  ] },
  checklist: { View: ChecklistView, card: true },
  flash: { View: FlashView, card: true, actions: (_w, _a, open) => [{ label: "Изменить карточки", run: () => open("flash") }] },
  quiz: { View: QuizView, card: true, actions: (_w, _a, open) => [{ label: "Изменить вопрос", run: () => open("quiz") }] },
  deadlines: { View: DeadlinesView, card: true },
  timer: { View: TimerView, card: true, actions: (_w, _a, open) => [{ label: "Минуты", title: "Длительность работы и перерыва", run: () => open("timer") }] },
  callout: { View: CalloutView, actions: (w, api) => ([["info", "Важно"], ["warn", "Внимание"], ["ok", "Запомнить"]] as const).map(([tone, label]) => ({ label, title: "Цвет выноски", run: () => set(api, w, "callout", (d) => ({ ...d, tone })) })) },
  image: { View: ImageWidget, card: true },
  code: { View: CodeView, card: true },
  toc: { View: TocView, card: true },
  source: { View: SourceView, card: true },
};
