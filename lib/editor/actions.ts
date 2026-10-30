"use client";
/** Действия над выделением — общие для панели свойств, контекстного меню и горячих клавиш */
import { toast } from "@/components/ui";
import { data } from "@/lib/data";
import type { ImageContent } from "@/lib/data/images";
import { MAX_FILE } from "@/lib/data/upload-rules";
import type { CanvasElement } from "@/lib/types";
import { alignPatches, distributePatches, makeGroup, orphanGroups, ungroup, zOrder, type Align, type ZMove } from "./arrange";
import { makeElement, topZ } from "./factory";
import { toWorld, type Pt } from "./geometry";
import { BOUNDARY_MESSAGE, useEditor } from "./store";
import { useUi } from "./ui";

const st = () => useEditor.getState();

/** Выделенные объекты вместе с участниками их групп и самими группами */
export function withGroups(ids: string[]): CanvasElement[] {
  const { els } = st();
  const set = new Set(ids);
  for (const id of ids) {
    const g = els[id]?.groupId;
    if (g) { set.add(g); Object.values(els).forEach((e) => e.groupId === g && set.add(e.id)); }
  }
  return [...set].map((id) => els[id]).filter(Boolean);
}

const selectedItems = () => st().selected.map((id) => st().els[id]).filter(Boolean);

export function setStyle(patch: Record<string, unknown>, only?: (e: CanvasElement) => boolean) {
  const items = selectedItems().filter((e) => !only || only(e));
  if (items.length) st().apply(Object.fromEntries(items.map((e) => [e.id, { style: { ...e.style, ...patch } }])));
}
export function setContent(patch: Record<string, unknown>, only?: (e: CanvasElement) => boolean) {
  const items = selectedItems().filter((e) => !only || only(e));
  if (items.length) st().apply(Object.fromEntries(items.map((e) => [e.id, { content: { ...e.content, ...patch } }])), "text");
}

export function arrangeZ(move: ZMove) {
  const ids = withGroups(st().selected).map((e) => e.id);
  const p = zOrder(st().els, ids, move);
  if (Object.keys(p).length) st().apply(p);
}

export function align(how: Align) {
  // группа выравнивается как единое целое
  const items = withGroups(st().selected).filter((e) => e.type !== "group" && e.type !== "connector");
  const p = alignPatches(items, how);
  if (Object.keys(p).length && !st().apply(p)) toast(BOUNDARY_MESSAGE);
}
export function distribute(axis: "x" | "y") {
  const p = distributePatches(withGroups(st().selected).filter((e) => e.type !== "group" && e.type !== "connector"), axis);
  if (Object.keys(p).length) st().apply(p);
}

export function groupSelection() {
  const s = st();
  const items = withGroups(s.selected);
  const g = makeGroup(items, s.canvasId!);
  if (!g) return;
  const oldGroups = items.filter((e) => e.type === "group").map((e) => e.id);
  s.batch({ add: [g.group], patch: g.patch, remove: oldGroups });
}

export function ungroupSelection() {
  const s = st();
  const groups = [...new Set(withGroups(s.selected).map((e) => (e.type === "group" ? e.id : e.groupId)).filter(Boolean) as string[])];
  if (!groups.length) return;
  s.batch(ungroup(s.els, groups));
}

export function deleteSelection() {
  const s = st();
  if (!s.canEdit || !s.selected.length) return;
  const ids = withGroups(s.selected).map((e) => e.id);
  // связи с удалёнными объектами удаляются вместе с ними
  const links = Object.values(s.els).filter((e) => e.type === "connector" &&
    (ids.includes(e.content.fromId as string) || ids.includes(e.content.toId as string))).map((e) => e.id);
  const gone = new Set([...ids, ...links]);
  const rest = Object.fromEntries(Object.entries(s.els).filter(([id]) => !gone.has(id)));
  const groups = orphanGroups(rest, Object.values(s.els).filter((e) => gone.has(e.id) && e.groupId).map((e) => e.groupId!));
  if (groups.length) {
    s.batch({ ...ungroup(rest, groups), remove: [...gone, ...groups] });
  } else s.remove([...gone]);
}

/** Центр видимой области в мировых координатах */
export function viewCenter(): Pt {
  return toWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, st().camera);
}

export function create(type: CanvasElement["type"], at: Pt, over: Partial<CanvasElement> = {}) {
  const s = st();
  if (!s.canEdit || !s.canvasId) return null;
  const el = makeElement(type, at, s.canvasId, topZ(s.els), over);
  if (!s.add([el])) { toast(BOUNDARY_MESSAGE); return null; }
  s.select([el.id]);
  return el;
}

/** Изображения: выбор файла, перетаскивание, вставка из буфера (ТЗ 4.2.5) */
async function insertOnOriginalPage(canvasId: string, type: CanvasElement["type"], at: Pt, over: Partial<CanvasElement>) {
  if (st().canvasId === canvasId) { create(type, at, over); return; }
  // An upload may finish after navigation. Persist to its original page rather
  // than accidentally inserting into the document that is currently open.
  const existing = await data.listElements(canvasId);
  if (st().canvasId === canvasId) { create(type, at, over); return; }
  const zIndex = topZ(Object.fromEntries(existing.map((el) => [el.id, el])));
  const el = makeElement(type, at, canvasId, zIndex, over);
  await data.upsertElements([el]);
  if (st().canvasId === canvasId && st().canEdit) st().add([el]);
  toast("Файл добавлен на исходную страницу");
}

export async function insertImages(files: File[], at = viewCenter()) {
  const ws = useUi.getState().workspaceId;
  const canvasId = st().canvasId;
  if (!ws || !st().canEdit || !canvasId) return;
  let dx = 0;
  for (const file of files) {
    if (file.size > MAX_FILE) { toast("Файл больше 25 МиБ"); continue; }
    try {
      const img: ImageContent = await data.uploadImage(ws, file);
      const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(16, Math.round(img.naturalWidth * k)), height = Math.max(16, Math.round(img.naturalHeight * k));
      await insertOnOriginalPage(canvasId, "image", { x: at.x + dx, y: at.y + dx }, { width, height, content: { ...img }, style: {} });
      dx += 32;
    } catch (e) {
      toast((e as Error).message || "Не удалось добавить изображение");
    }
  }
}

export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}

export function startEditing(id: string) {
  const e = st().els[id];
  if (!e || !st().canEdit) return;
  if (["text", "note", "shape", "diagram_node", "formula"].includes(e.type)) {
    st().select([id]);
    // после текущего нажатия: иначе фокус вернётся холсту и редактирование сразу закроется
    setTimeout(() => useUi.getState().setEditing(id), 0);
  }
}

/** Файлы-источники: PDF, PPTX, TXT, MD, PNG, JPEG → источник тетради и карточка в точке (ТЗ 4.2.5–4.2.6) */
export async function insertSources(files: File[], at = viewCenter()) {
  const ws = useUi.getState().workspaceId;
  const canvasId = st().canvasId;
  if (!ws || !st().canEdit || !canvasId) return;
  let dy = 0;
  for (const file of files) {
    try {
      const src = await data.uploadSource(ws, file);
      await insertOnOriginalPage(canvasId, "source", { x: at.x, y: at.y + dy }, {
        width: 280, height: 72, sourceId: src.id,
        content: { name: src.originalName, mime: src.mimeType, status: src.status, size: src.size },
      });
      dy += 88;
    } catch (e) {
      toast((e as Error).message || "Не удалось загрузить файл");
    }
  }
}
