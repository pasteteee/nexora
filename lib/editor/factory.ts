import type { CanvasElement, ElementType } from "@/lib/types";
import type { Pt } from "./geometry";

export type CreatableType = Exclude<ElementType, "group" | "source" | "source_fragment" | "image" | "connector">;

const DEFAULTS: Record<CreatableType, Pick<CanvasElement, "width" | "height" | "content" | "style">> = {
  text: { width: 280, height: 44, content: { text: "" }, style: { fontSize: 16, align: "left" } },
  note: { width: 200, height: 160, content: { text: "" }, style: { color: "yellow", fontSize: 16 } },
  shape: { width: 160, height: 120, content: { kind: "rect", text: "" }, style: { fill: "blue", stroke: "ink", fontSize: 16, align: "center" } },
  diagram_node: { width: 180, height: 72, content: { text: "" }, style: { color: "gray", fontSize: 16, align: "center" } },
  formula: { width: 260, height: 80, content: { latex: "E = mc^2" }, style: { fontSize: 20 } },
};

/** Новый объект с центром в точке at и порядком наложения поверх остальных */
export function makeElement(
  type: CanvasElement["type"], at: Pt, canvasId: string, zIndex: number, over: Partial<CanvasElement> = {},
): CanvasElement {
  const d = DEFAULTS[type as CreatableType] ?? { width: 200, height: 120, content: {}, style: {} };
  const width = over.width ?? d.width, height = over.height ?? d.height;
  return {
    id: crypto.randomUUID(), canvasId, type,
    x: Math.round(at.x - width / 2), y: Math.round(at.y - height / 2), width, height,
    rotation: 0, zIndex, content: { ...d.content }, style: { ...d.style },
    sourceId: null, groupId: null, createdBy: null, updatedAt: new Date().toISOString(),
    ...over,
  };
}

export const topZ = (els: Record<string, CanvasElement>) => Math.max(0, ...Object.values(els).map((e) => e.zIndex)) + 1;
