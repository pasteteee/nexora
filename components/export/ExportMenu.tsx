"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileJson, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "@/components/ui";
import { useEditor } from "@/lib/editor/store";
import { documentBlocks } from "@/lib/editor/document";
import { exportFileName } from "@/lib/export/area";
import { buildPageExport } from "@/lib/export/json";
import type { Canvas } from "@/lib/types";
import { DockButton } from "@/components/ui/Dock";
import s from "./menu.module.css";

type Busy = null | "png" | "pdf" | "json";

/** Экспорт страницы для владельца и редактора (ТЗ 4.2.10, 4.2.4): PNG 1×/2× с фоном/без, PDF, JSON. */
export function ExportMenu({ page, compact }: { page: Canvas; /** dock button; the panel opens upwards */ compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"page" | "selection">("page");
  const [scale, setScale] = useState<1 | 2>(2);
  const [withBg, setWithBg] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const selectedCount = useEditor((st) => st.selected.filter((id) => st.els[id] && st.els[id].type !== "group").length);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const effectiveScope = scope === "selection" && selectedCount ? "selection" : "page";
  function blocks() {
    const st = useEditor.getState();
    const all = documentBlocks(st.els);
    return effectiveScope === "selection" ? all.filter((el) => st.selected.includes(el.id)) : all;
  }

  async function run(kind: Exclude<Busy, null>) {
    setBusy(kind); setError("");
    try {
      const st = useEditor.getState();
      if (kind === "json") {
        const { downloadBlob } = await import("@/lib/export/render");
        const json = JSON.stringify(buildPageExport(page, st.els), null, 2);
        downloadBlob(new Blob([json], { type: "application/json" }), exportFileName(page.name, "json"));
      } else {
        // Loaded on demand: html-to-image is only needed when someone exports.
        const { renderSnapshot, canvasToBlob, canvasToPdf, downloadBlob } = await import("@/lib/export/render");
        const list = blocks();
        const canvas = await renderSnapshot({
          title: effectiveScope === "page" ? page.name : undefined, blocks: list, scale: kind === "pdf" ? 2 : scale,
          background: kind === "pdf" || withBg ? st.background : null,
        });
        const blob = kind === "png" ? await canvasToBlob(canvas, "image/png") : await canvasToPdf(canvas, page.name);
        downloadBlob(blob, exportFileName(page.name, kind));
      }
      toast(kind === "json" ? "JSON-копия страницы сохранена" : `${kind.toUpperCase()} сохранён`);
    } catch (e) {
      const { ExportError } = await import("@/lib/export/render");
      setError(e instanceof ExportError ? e.message : "Не удалось экспортировать. Попробуйте ещё раз.");
    } finally { setBusy(null); }
  }

  return <div ref={box} className={s.wrap} data-up={compact || undefined}>
    {compact
      ? <DockButton icon={<Download size={18} />} tip="Экспорт: PNG, PDF, JSON" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} />
      : <button className={s.trigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} title="Экспорт">
        <Download size={17} /><span>Экспорт</span>
      </button>}
    {open && <div className={s.panel} role="dialog" aria-label="Экспорт страницы">
      <fieldset className={s.group}>
        <legend>Что экспортировать</legend>
        <label><input type="radio" name="export-scope" checked={effectiveScope === "page"} onChange={() => setScope("page")} />Вся страница</label>
        <label data-disabled={!selectedCount || undefined}><input type="radio" name="export-scope" disabled={!selectedCount}
          checked={effectiveScope === "selection"} onChange={() => setScope("selection")} />Выделенные блоки{selectedCount ? ` (${selectedCount})` : ""}</label>
      </fieldset>
      <fieldset className={s.group}>
        <legend>PNG</legend>
        <div className={s.segment} role="radiogroup" aria-label="Масштаб">
          {([1, 2] as const).map((v) => <button key={v} role="radio" aria-checked={scale === v} onClick={() => setScale(v)}>{v}×</button>)}
        </div>
        <div className={s.segment} role="radiogroup" aria-label="Фон">
          <button role="radio" aria-checked={withBg} onClick={() => setWithBg(true)}>С фоном</button>
          <button role="radio" aria-checked={!withBg} onClick={() => setWithBg(false)}>Без фона</button>
        </div>
      </fieldset>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}>
        <button disabled={!!busy} onClick={() => void run("png")}><ImageIcon size={15} />{busy === "png" ? "Готовим PNG…" : "Скачать PNG"}</button>
        <button disabled={!!busy} onClick={() => void run("pdf")}><FileText size={15} />{busy === "pdf" ? "Готовим PDF…" : "Скачать PDF"}</button>
        <button disabled={!!busy} onClick={() => void run("json")}><FileJson size={15} />{busy === "json" ? "Сохраняем…" : "JSON-копия страницы"}</button>
      </div>
      <p className={s.note}>JSON содержит всю страницу и не меняет её. PDF всегда с фоном.</p>
    </div>}
  </div>;
}
