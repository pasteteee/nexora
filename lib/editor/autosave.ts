"use client";
/**
 * Автосохранение без кнопки «Сохранить» (ТЗ 4.2.4, критерий 6).
 * Изменения копятся и уходят пачкой: геометрия — не чаще раза в 200 мс, текст — через 1 с после последнего ввода.
 * При ошибке пакет остаётся в очереди, пользователь видит состояние и может повторить.
 */
import { create } from "zustand";
import { data } from "@/lib/data";
import type { CanvasElement } from "@/lib/types";

export type SaveStatus = "saved" | "pending" | "saving" | "error";
export const useSaveStatus = create<{ status: SaveStatus; error: string | null }>(() => ({ status: "saved", error: null }));

const GEOMETRY_MS = 200;
const TEXT_MS = 1000;

let getEl: (id: string) => CanvasElement | undefined = () => undefined;
const dirty = new Set<string>();
const removed = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let due = 0;
let inflight: Promise<void> | null = null;

export function bindAutosave(lookup: (id: string) => CanvasElement | undefined) {
  getEl = lookup;
}

function schedule(ms: number) {
  const at = Date.now() + ms;
  // текстовая задержка сдвигается при каждом вводе, геометрия не откладывает уже назначенное сохранение
  if (timer && ms === GEOMETRY_MS && due <= at) return;
  clearTimeout(timer);
  due = at;
  timer = setTimeout(flush, ms);
}

export function markChanged(ids: string[], kind: "geometry" | "text" = "geometry") {
  ids.forEach((id) => { dirty.add(id); removed.delete(id); });
  useSaveStatus.setState({ status: "pending" });
  schedule(kind === "text" ? TEXT_MS : GEOMETRY_MS);
}
export function markRemoved(ids: string[]) {
  ids.forEach((id) => { removed.add(id); dirty.delete(id); });
  useSaveStatus.setState({ status: "pending" });
  schedule(GEOMETRY_MS);
}

export async function flush(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  if (inflight) { await inflight; if (dirty.size || removed.size) return flush(); return; }
  if (!dirty.size && !removed.size) return;
  const up = [...dirty].map(getEl).filter((e): e is CanvasElement => !!e);
  const del = [...removed];
  dirty.clear(); removed.clear();
  useSaveStatus.setState({ status: "saving" });
  inflight = (async () => {
    try {
      await data.upsertElements(up);
      await data.deleteElements(del);
      useSaveStatus.setState({ status: dirty.size || removed.size ? "pending" : "saved", error: null });
    } catch (e) {
      // вернуть в очередь, если за время запроса объект не изменили и не удалили
      up.forEach((el) => !removed.has(el.id) && dirty.add(el.id));
      del.forEach((id) => !dirty.has(id) && removed.add(id));
      useSaveStatus.setState({ status: "error", error: e instanceof Error ? e.message : "Нет соединения" });
    } finally {
      inflight = null;
    }
  })();
  await inflight;
  if (useSaveStatus.getState().status === "pending") schedule(GEOMETRY_MS);
}

export const hasUnsaved = () => dirty.size > 0 || removed.size > 0 || !!inflight;

/** Для тестов */
export function resetAutosave() { clearTimeout(timer); timer = undefined; dirty.clear(); removed.clear(); inflight = null; useSaveStatus.setState({ status: "saved", error: null }); }
