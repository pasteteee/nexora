"use client";
import { create } from "zustand";

export type Tool = "select" | "text" | "note" | "shape" | "diagram_node" | "formula" | "connector";

/** Состояние интерфейса редактора, не попадающее в историю и сохранение */
export const useUi = create<{
  tool: Tool;
  editing: string | null;
  workspaceId: string | null;
  setTool(t: Tool): void;
  setEditing(id: string | null): void;
}>((set) => ({
  tool: "select",
  editing: null,
  workspaceId: null,
  setTool: (tool) => set({ tool }),
  setEditing: (editing) => set({ editing }),
}));
