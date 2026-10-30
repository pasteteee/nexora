"use client";
import { FileText, Presentation, FileType2, Image as ImageIcon, Quote } from "lucide-react";
import type { CanvasElement, SourceStatus } from "@/lib/types";
import s from "./elements.module.css";

const STATUS: Record<SourceStatus, string> = {
  pending: "В очереди", processing: "Обработка", ready: "Готово", error: "Ошибка", requires_ocr: "Требуется OCR",
};
const icon = (mime: string) =>
  mime.includes("pdf") ? <FileText size={20} /> : mime.includes("presentation") ? <Presentation size={20} />
    : mime.startsWith("image/") ? <ImageIcon size={20} /> : <FileType2 size={20} />;

/** Ссылка на источник: название, тип и статус; ссылка на фрагмент — текст и страница */
export function SourceCard({ el }: { el: CanvasElement }) {
  const c = el.content as { name?: string; mime?: string; status?: SourceStatus; text?: string; page?: number; pageRef?: string };
  if (el.type === "source_fragment") {
    return (
      <div className={s.fragment}>
        <Quote size={16} className={s.fragmentIcon} />
        <p>{c.text}</p>
        <span className={s.meta}>{c.name}{c.pageRef ? ` · ${c.pageRef}` : c.page ? ` · с. ${c.page}` : ""}</span>
      </div>
    );
  }
  const ext = (c.name?.split(".").pop() ?? "").toUpperCase();
  return (
    <div className={s.source}>
      <span className={s.sourceIcon}>{icon(c.mime ?? "")}</span>
      <span className={s.sourceName}>{c.name}</span>
      <span className={s.meta}>{ext} · <span data-status={c.status}>{STATUS[c.status ?? "pending"]}</span></span>
    </div>
  );
}
