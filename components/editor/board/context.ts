"use client";
import { createContext, useContext } from "react";
import type { PhotoBlock } from "@/lib/photo/blocks";
import type { PhotoImage } from "@/lib/photo/insert";
import type { Line, NoteWidget, Widget, WidgetData, WidgetType } from "@/lib/editor/board/model";

export type FocusRequest = { id: string; lid?: string; at?: "start" | "end" | number; open?: boolean };

export type BoardApi = {
  edit: boolean;
  /** Merge a patch into the element content as one history step. */
  setContent(id: string, patch: Record<string, unknown>): void;
  setData<T extends NoteWidget>(w: Widget, t: T, data: WidgetData[T]): void;
  setLines(w: Widget, lines: Line[]): void;
  setStyle(id: string, patch: Record<string, unknown>): void;
  /** Short message above the widget: limits and hints. */
  notify(id: string, message: string): void;
  remove(id: string): void;
  /** New widget right below `after` (same column), or at the end of the page. */
  add(type: WidgetType, after?: Widget | null): void;
  /** Slash menu inside a text widget: the widget goes where the line is, the lines after it continue below. */
  insertAtLine(w: Widget, lineIndex: number, type: WidgetType): void;
  focus(req: FocusRequest): void;
  /** Widgets in reading order (top to bottom, left to right). */
  ordered(): Widget[];
  /** Blocks recognised from a photo, as widgets after `afterId` (or at the end), optionally with the photo first. */
  insertBlocks(blocks: PhotoBlock[], afterId?: string | null, image?: PhotoImage | null): void;
};

export const BoardContext = createContext<BoardApi | null>(null);
export function useBoard(): BoardApi {
  const api = useContext(BoardContext);
  if (!api) throw new Error("useBoard outside of Board");
  return api;
}
