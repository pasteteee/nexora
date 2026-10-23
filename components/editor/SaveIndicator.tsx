"use client";
import { useEffect } from "react";
import { CloudOff } from "lucide-react";
import { flush, hasUnsaved, useSaveStatus } from "@/lib/editor/autosave";
import s from "./editor.module.css";

/** Состояние сохранения словами; при ошибке — кнопка «Повторить» */
export function SaveIndicator() {
  const { status, error } = useSaveStatus();

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (hasUnsaved()) { flush(); e.preventDefault(); } };
    const hidden = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("visibilitychange", hidden); };
  }, []);

  if (status === "error") {
    return (
      <button type="button" className={s.saveError} onClick={() => flush()} title={error ?? undefined}>
        <CloudOff size={15} /> Не сохранено · Повторить
      </button>
    );
  }
  return (
    <span className={s.save} aria-live="polite">
      {status === "saved" ? "Сохранено" : "Сохраняем…"}
    </span>
  );
}
