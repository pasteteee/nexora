"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathView } from "@/components/editor/board/MathLine";
import { data, demoMode } from "@/lib/data";
import { useUi } from "@/lib/editor/ui";
import { compileFn } from "@/lib/editor/board/math";
import { BLOCK_LABEL, PHOTO_HINTS, plotFn, type PhotoBlock, type PhotoHint } from "@/lib/photo/blocks";
import { clampQuad, fullQuad, rotateQuad, type Quad } from "@/lib/photo/geometry";
import { applyFilter, flatten, loadPhoto, PHOTO_FILTERS, rotate, scaled, toJpeg, type PhotoFilter } from "@/lib/photo/image";
import type { PhotoImage } from "@/lib/photo/insert";
import s from "./photo.module.css";

/** Any part of the app opens the dialog with this event; `detail.afterId` is the widget the result goes after. */
export const PHOTO_EVENT = "nexora:photo-import";
export type PhotoEventDetail = { afterId?: string | null };
export const openPhotoImport = (detail: PhotoEventDetail = {}) => window.dispatchEvent(new CustomEvent(PHOTO_EVENT, { detail }));

type Step = "pick" | "edit" | "busy" | "result";
type Item = PhotoBlock & { on: boolean };
const PREVIEW = 1100;

/**
 * «Фото в тетрадь»: снять или выбрать фото → обрезать рамкой по углам листа (перспектива выпрямляется),
 * повернуть, выбрать фильтр скана → распознать → проверить блоки и вставить их виджетами.
 */
export function PhotoImport({ onClose, onInsert }: { onClose(): void; onInsert(blocks: PhotoBlock[], image: PhotoImage | null): void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [turns, setTurns] = useState(0);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [filter, setFilter] = useState<PhotoFilter>("scan");
  const [hint, setHint] = useState<PhotoHint>("auto");
  const [keepPhoto, setKeepPhoto] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [scanUrl, setScanUrl] = useState("");
  const [inserting, setInserting] = useState(false);
  const scanBlob = useRef<Blob | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const d = dlg.current;
    if (d && !d.open) d.showModal();
    return () => { abort.current?.abort(); };
  }, []);
  useEffect(() => () => { if (scanUrl) URL.revokeObjectURL(scanUrl); }, [scanUrl]);

  // Upright photo at the current quarter turn; the frame is kept in its coordinates.
  const rotated = useMemo(() => (src ? rotate(src, turns) : null), [src, turns]);
  const preview = useMemo(() => {
    if (!rotated) return "";
    const c = scaled(rotated, PREVIEW);
    const copy = document.createElement("canvas");
    copy.width = c.width; copy.height = c.height;
    copy.getContext("2d")!.drawImage(c, 0, 0);
    return applyFilter(copy, filter).toDataURL("image/jpeg", 0.85);
  }, [rotated, filter]);

  async function open(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) { setError("Нужна картинка: JPEG, PNG или WebP"); return; }
    setError("");
    try {
      const c = await loadPhoto(file);
      setSrc(c); setTurns(0); setQuad(fullQuad(c.width, c.height)); setStep("edit");
    } catch (e) { setError((e as Error).message); }
  }

  // Ctrl+V with a screenshot or a copied picture works on the first step.
  useEffect(() => {
    if (step !== "pick") return;
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); void open(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [step]);

  function turn(d: 1 | -1) {
    if (!rotated || !quad) return;
    const t = d === 1 ? 1 : 3;
    setQuad(rotateQuad(quad, rotated.width, rotated.height, t));
    setTurns((x) => (x + t) % 4);
  }

  /** The processed sheet: flattened, filtered, as JPEG. */
  async function scan(): Promise<Blob> {
    if (!rotated || !quad) throw new Error("Сначала выберите фото");
    const flat = applyFilter(flatten(rotated, quad, 2000), filter);
    const blob = await toJpeg(flat);
    scanBlob.current = blob;
    setScanUrl(URL.createObjectURL(blob));
    return blob;
  }

  async function recognize() {
    const ws = useUi.getState().workspaceId;
    setError("");
    if (demoMode) { setError("Распознавание работает в рабочей версии после входа. В демо фото можно вставить картинкой"); return; }
    if (!ws) { setError("Откройте тетрадь, чтобы распознать фото"); return; }
    setStep("busy");
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const blob = await scan();
      const form = new FormData();
      form.set("workspaceId", ws);
      form.set("hint", hint);
      form.set("image", blob, "photo.jpg");
      const res = await fetch("/api/ai/photo", { method: "POST", body: form, signal: ctl.signal });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Не удалось распознать фото");
      const blocks = (json.blocks ?? []) as PhotoBlock[];
      setItems(blocks.map((b) => ({ ...b, on: true })));
      if (!blocks.length) { setKeepPhoto(true); setError("На фото не нашлось текста, формул или графиков. Можно вставить его картинкой"); }
      setStep("result");
    } catch (e) {
      if (ctl.signal.aborted) { setStep("edit"); return; }
      setError((e as Error).message || "Не удалось распознать фото");
      setStep("edit");
    } finally { abort.current = null; }
  }

  async function photoImage(): Promise<PhotoImage | null> {
    const ws = useUi.getState().workspaceId;
    const blob = scanBlob.current ?? (await scan());
    if (!ws) return null;
    const file = new File([blob], `foto-${new Date().toISOString().slice(0, 10)}.jpg`, { type: "image/jpeg" });
    const content = await data.uploadImage(ws, file);
    const k = Math.min(1, 480 / Math.max(content.naturalWidth, content.naturalHeight));
    return { content, width: Math.max(16, Math.round(content.naturalWidth * k)), height: Math.max(16, Math.round(content.naturalHeight * k)) };
  }

  async function insert(onlyPhoto = false) {
    setInserting(true); setError("");
    try {
      const blocks = onlyPhoto ? [] : items.filter((b) => b.on).map(({ on: _on, ...b }) => { void _on; return b as PhotoBlock; });
      const image = onlyPhoto || keepPhoto ? await photoImage() : null;
      if (!blocks.length && !image) { setError("Отметьте хотя бы один блок"); return; }
      onInsert(blocks, image);
      close();
    } catch (e) {
      setError((e as Error).message || "Не удалось вставить");
    } finally { setInserting(false); }
  }

  function close() { abort.current?.abort(); dlg.current?.close(); onClose(); }
  const patch = (id: string, p: Partial<Item>) => setItems((list) => list.map((b) => (b.id === id ? ({ ...b, ...p } as Item) : b)));
  const chosen = items.filter((b) => b.on).length;

  return <dialog ref={dlg} className={s.dlg} aria-labelledby="photo-title" onCancel={(e) => { e.preventDefault(); close(); }}
    onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div className={s.box} data-step={step}>
      <header className={s.head}>
        <div>
          <h2 id="photo-title">Фото в тетрадь</h2>
          <ol className={s.steps} aria-label="Шаги">
            <li data-on={step === "pick" || undefined}>Фото</li>
            <li data-on={step === "edit" || step === "busy" || undefined}>Рамка и скан</li>
            <li data-on={step === "result" || undefined}>Проверка</li>
          </ol>
        </div>
        <button type="button" className={s.x} onClick={close} aria-label="Закрыть">×</button>
      </header>

      {step === "pick" && <div className={s.pick} data-over={dragOver || undefined}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void open(e.dataTransfer.files[0]); }}>
        <div className={s.pickArt} aria-hidden="true">
          <svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 22h10l5-7h18l5 7h10v30H8z" /><circle cx="32" cy="36" r="9" /><path d="M14 4v8M10 8h8" /></svg>
        </div>
        <p className={s.lead}>Сфотографируйте конспект, доску, формулу или график. Текст станет текстом, формулы формулами, а график графиком, который можно менять.</p>
        <div className={s.pickBtns}>
          <label className={s.primary}>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => void open(e.target.files?.[0])} />
            Снять на камеру
          </label>
          <label className={s.secondary}>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" onChange={(e) => void open(e.target.files?.[0])} />
            Выбрать файл
          </label>
        </div>
        <p className={s.small}>Или перетащите фото сюда, или вставьте скриншот через Ctrl+V</p>
      </div>}

      {(step === "edit" || step === "busy") && rotated && quad && <div className={s.edit}>
        <Cropper url={preview} w={rotated.width} h={rotated.height} quad={quad} onQuad={setQuad} busy={step === "busy"} />
        <aside className={s.side}>
          <section>
            <h3>Рамка</h3>
            <p className={s.small}>Перетащите углы к краям листа: наклон и перспектива выпрямятся.</p>
            <div className={s.row}>
              <button type="button" className={s.tool} onClick={() => turn(-1)} disabled={step === "busy"} title="Повернуть против часовой">⟲ Повернуть</button>
              <button type="button" className={s.tool} onClick={() => turn(1)} disabled={step === "busy"} title="Повернуть по часовой" aria-label="Повернуть по часовой">⟳</button>
              <button type="button" className={s.tool} onClick={() => setQuad(fullQuad(rotated.width, rotated.height))} disabled={step === "busy"}>Всё фото</button>
            </div>
          </section>
          <section>
            <h3>Обработка</h3>
            <div className={s.seg} role="radiogroup" aria-label="Обработка">
              {PHOTO_FILTERS.map(([f, name, about]) => <button key={f} type="button" role="radio" aria-checked={filter === f} title={about} disabled={step === "busy"} onClick={() => setFilter(f)}>{name}</button>)}
            </div>
          </section>
          <section>
            <h3>Что на фото</h3>
            <div className={s.chips} role="radiogroup" aria-label="Что на фото">
              {PHOTO_HINTS.map(([h, name]) => <button key={h} type="button" role="radio" aria-checked={hint === h} disabled={step === "busy"} onClick={() => setHint(h)}>{name}</button>)}
            </div>
          </section>
          {error && <p className={s.err} role="alert">{error}</p>}
          <div className={s.actions}>
            {step === "busy"
              ? <><span className={s.busy} role="status"><i aria-hidden="true" />Распознаю, до 30 секунд…</span>
                  <button type="button" className={s.secondary} onClick={() => abort.current?.abort()}>Отменить</button></>
              : <><button type="button" className={s.primary} onClick={() => void recognize()}>Распознать</button>
                  <button type="button" className={s.ghost} onClick={() => void insert(true)} disabled={inserting}>Вставить как картинку</button>
                  <button type="button" className={s.ghost} onClick={() => { setSrc(null); setStep("pick"); setError(""); }}>Другое фото</button></>}
          </div>
        </aside>
      </div>}

      {step === "result" && <div className={s.result}>
        <figure className={s.scan}>
          {/* A local blob URL of the processed scan: next/image has nothing to optimise here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {scanUrl && <img src={scanUrl} alt="Обработанное фото" />}
          <figcaption>Так фото увидел ИИ</figcaption>
        </figure>
        <div className={s.blocks}>
          {items.length > 0 && <p className={s.small}>Проверьте и поправьте блоки. Снимите галочку с лишних. После вставки всё можно редактировать на странице.</p>}
          {items.map((b) => <BlockCard key={b.id} b={b} onChange={(p) => patch(b.id, p)} />)}
          {error && <p className={s.err} role="alert">{error}</p>}
          <label className={s.check}><input type="checkbox" checked={keepPhoto} onChange={(e) => setKeepPhoto(e.target.checked)} /> Вставить и само фото (скан) перед блоками</label>
          <div className={s.actions}>
            <button type="button" className={s.primary} disabled={inserting || (!chosen && !keepPhoto)} onClick={() => void insert()}>
              {inserting ? "Вставляю…" : chosen ? `Вставить в тетрадь: ${chosen}${keepPhoto ? " и фото" : ""}` : "Вставить фото"}
            </button>
            <button type="button" className={s.ghost} onClick={() => { setStep("edit"); setError(""); }}>Назад к рамке</button>
          </div>
        </div>
      </div>}
      {step === "pick" && error && <p className={s.err} role="alert">{error}</p>}
    </div>
  </dialog>;
}

/** The photo with the four-corner frame. Coordinates are in pixels of the photo; the SVG scales them. */
function Cropper({ url, w, h, quad, onQuad, busy }: { url: string; w: number; h: number; quad: Quad; onQuad(q: Quad): void; busy: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const [k, setK] = useState(1);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const n = svg.current;
    if (!n) return;
    const ro = new ResizeObserver(() => setK(w / Math.max(1, n.getBoundingClientRect().width)));
    ro.observe(n);
    return () => ro.disconnect();
  }, [w]);
  const toPhoto = (e: { clientX: number; clientY: number }) => {
    const m = svg.current!.getScreenCTM()!.inverse(), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  function drag(e: React.PointerEvent, i: number) {
    if (busy) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setActive(i);
    let cur = quad;
    const move = (ev: PointerEvent) => {
      const q = [...cur] as Quad;
      q[i] = toPhoto(ev);
      cur = clampQuad(q, w, h, 24 * k);
      onQuad(cur);
    };
    const up = () => { setActive(null); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function key(e: React.KeyboardEvent, i: number) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const step = (e.shiftKey ? 40 : 8) * k, q = [...quad] as Quad;
    q[i] = { x: q[i].x + d[0] * step, y: q[i].y + d[1] * step };
    onQuad(clampQuad(q, w, h, 24 * k));
  }
  const pts = quad.map((p) => `${p.x},${p.y}`).join(" ");
  const r = 11 * k, names = ["левый верхний", "правый верхний", "правый нижний", "левый нижний"];
  return <div className={s.crop} data-busy={busy || undefined}>
    <svg ref={svg} viewBox={`0 0 ${w} ${h}`} role="group" aria-label="Фото и рамка обрезки">
      <image href={url} width={w} height={h} preserveAspectRatio="none" />
      <path className={s.shade} fillRule="evenodd" d={`M0 0H${w}V${h}H0Z M${pts.split(" ").join(" L")}Z`} />
      <polygon className={s.frame} points={pts} style={{ strokeWidth: 2 * k }} />
      {[1, 2].map((t) => <g key={t} className={s.thirds} style={{ strokeWidth: k }}>
        <line x1={quad[0].x + ((quad[3].x - quad[0].x) * t) / 3} y1={quad[0].y + ((quad[3].y - quad[0].y) * t) / 3} x2={quad[1].x + ((quad[2].x - quad[1].x) * t) / 3} y2={quad[1].y + ((quad[2].y - quad[1].y) * t) / 3} />
        <line x1={quad[0].x + ((quad[1].x - quad[0].x) * t) / 3} y1={quad[0].y + ((quad[1].y - quad[0].y) * t) / 3} x2={quad[3].x + ((quad[2].x - quad[3].x) * t) / 3} y2={quad[3].y + ((quad[2].y - quad[3].y) * t) / 3} />
      </g>)}
      {quad.map((p, i) => <circle key={i} className={s.corner} data-active={active === i || undefined} cx={p.x} cy={p.y} r={r} style={{ strokeWidth: 2.5 * k }}
        tabIndex={busy ? -1 : 0} role="slider" aria-label={`Угол рамки: ${names[i]}. Стрелки двигают угол`} aria-valuetext={`${Math.round(p.x)}, ${Math.round(p.y)}`}
        onPointerDown={(e) => drag(e, i)} onKeyDown={(e) => key(e, i)} />)}
    </svg>
    {busy && <div className={s.scanline} aria-hidden="true" />}
  </div>;
}

function BlockCard({ b, onChange }: { b: Item; onChange(p: Partial<Item>): void }) {
  const fnOk = b.kind === "plot" ? !!compileFn(b.fn) : true;
  return <article className={s.card} data-off={!b.on || undefined}>
    <header>
      <label className={s.check}><input type="checkbox" checked={b.on} onChange={(e) => onChange({ on: e.target.checked })} /> <b>{BLOCK_LABEL[b.kind]}</b></label>
    </header>
    {b.kind === "text" && <textarea aria-label="Текст" value={b.md} rows={Math.min(12, Math.max(2, b.md.split("\n").length + 1))} onChange={(e) => onChange({ md: e.target.value })} />}
    {b.kind === "formula" && <>
      <input aria-label="Формула" className={s.mono} value={b.src} onChange={(e) => onChange({ src: e.target.value })} />
      <div className={s.math}><MathView src={b.src} /></div>
    </>}
    {b.kind === "plot" && <>
      <label className={s.inline}>y = <input aria-label="Функция графика" className={s.mono} value={b.fn} aria-invalid={!fnOk}
        onChange={(e) => onChange({ fn: e.target.value })} onBlur={(e) => { const f = plotFn(e.target.value); if (f) onChange({ fn: f }); }} /></label>
      <div className={s.inline}>x от <input type="number" aria-label="x от" value={b.xmin} onChange={(e) => onChange({ xmin: Number(e.target.value) })} /> до <input type="number" aria-label="x до" value={b.xmax} onChange={(e) => onChange({ xmax: Number(e.target.value) })} /></div>
      {!fnOk && <p className={s.err}>Такую функцию график не построит. Пример: 2*x^2 - 3*x + 1</p>}
    </>}
    {b.kind === "table" && <div className={s.tableWrap}><table><tbody>{b.rows.slice(0, 12).map((r, i) => <tr key={i}>{r.map((c, j) => i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody></table>
      {b.rows.length > 12 && <p className={s.small}>И ещё строк: {b.rows.length - 12}</p>}</div>}
  </article>;
}
