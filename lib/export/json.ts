import { documentBlocks } from "@/lib/editor/document";
import type { Canvas, CanvasElement } from "@/lib/types";

export const PAGE_EXPORT_FORMAT = "nexora.page";
export const PAGE_EXPORT_VERSION = 1;

export interface PageExport {
  format: typeof PAGE_EXPORT_FORMAT;
  version: typeof PAGE_EXPORT_VERSION;
  exportedAt: string;
  page: Pick<Canvas, "id" | "workspaceId" | "name" | "backgroundType" | "backgroundSpacing" | "createdAt" | "updatedAt">;
  elements: CanvasElement[];
}

/**
 * JSON-копия структуры страницы для резервного копирования/переноса (ТЗ 4.2.10).
 * Возвращает глубокую копию: экспорт не может изменить исходные объекты редактора.
 */
export function buildPageExport(page: Canvas, els: Record<string, CanvasElement>, now = new Date()): PageExport {
  const groups = Object.values(els).filter((el) => el.type === "group");
  const ordered = [...documentBlocks(els), ...groups.sort((a, b) => a.id.localeCompare(b.id))];
  return structuredClone({
    format: PAGE_EXPORT_FORMAT,
    version: PAGE_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    page: { id: page.id, workspaceId: page.workspaceId, name: page.name, backgroundType: page.backgroundType,
      backgroundSpacing: page.backgroundSpacing, createdAt: page.createdAt, updatedAt: page.updatedAt },
    elements: ordered,
  });
}
