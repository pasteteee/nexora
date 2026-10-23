"use client";
import { useEffect } from "react";
import { CloudOff, Check, RotateCw } from "lucide-react";
import { flush, hasUnsaved, useSaveStatus } from "@/lib/editor/autosave";
import { Spinner } from "@/components/ui";

/** Состояние сохранения: точка-индикатор, при ошибке — «Повторить» */
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
      <button onClick={() => flush()} title={error ?? undefined}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", border: 0, borderRadius: 999, background: "rgba(212,72,59,.1)", color: "var(--danger)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
        <CloudOff size={15} /> Не сохранено <RotateCw size={14} />
      </button>
    );
  }
  return (
    <span aria-live="polite" title={status === "saved" ? "Всё сохранено" : "Сохраняем…"}
      style={{ display: "inline-grid", placeItems: "center", width: 34, height: 34, color: "var(--ink-3)" }}>
      {status === "saved" ? <Check size={16} /> : <Spinner />}
    </span>
  );
}
