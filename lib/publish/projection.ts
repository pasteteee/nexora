import type { BackgroundType } from "@/lib/types";

/** Read-only block of a published page. Only whitelisted, display-safe fields survive. */
export type PublicBlock =
  | { id: string; kind: "text"; text: string; note: boolean; style: PublicStyle }
  | { id: string; kind: "formula"; latex: string; style: PublicStyle }
  | { id: string; kind: "shape"; text: string; shape: string; style: PublicStyle };

export interface PublicStyle { color?: string; fill?: string; stroke?: string; fontSize?: number; fontWeight?: number | string; align?: "left" | "center" | "right"; opacity?: number }

export interface PublicPage {
  name: string;
  backgroundType: BackgroundType;
  backgroundSpacing: number;
  blocks: PublicBlock[];
}

/** Publication slugs are random capabilities: hex/url-safe, 32–128 chars (matches the DB check). Anything else is not looked up. */
export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(slug);
}

const BACKGROUNDS: BackgroundType[] = ["plain", "grid", "dots", "ruled"];
const SPACINGS = [16, 24, 32, 48];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 20000) => typeof v === "string" ? v.slice(0, max) : "";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
// Colors arrive as user data; accept only plain color tokens so nothing can escape into CSS.
const color = (v: unknown) => typeof v === "string" && /^(#[0-9a-f]{3,8}|[a-z]{3,20}|var\(--[a-z0-9-]{1,40}\)|(rgb|hsl)a?\([0-9.,%\s/]{1,60}\))$/i.test(v.trim()) ? v.trim() : undefined;

function style(raw: unknown): PublicStyle {
  if (!isObject(raw)) return {};
  const pick = (...keys: string[]) => keys.map((k) => raw[k]).find((v) => v !== undefined && v !== null);
  const out: PublicStyle = {};
  const c = color(pick("color")), f = color(pick("fill")), s = color(pick("stroke"));
  if (c) out.color = c; if (f) out.fill = f; if (s) out.stroke = s;
  const size = num(pick("fontSize", "font_size"));
  if (size !== null) out.fontSize = Math.min(96, Math.max(8, size));
  const weight = pick("fontWeight", "font_weight");
  if (typeof weight === "number" || (typeof weight === "string" && /^(normal|bold|[1-9]00)$/.test(weight))) out.fontWeight = weight;
  const align = pick("align", "textAlign", "text_align");
  if (align === "left" || align === "center" || align === "right") out.align = align;
  const opacity = num(pick("opacity"));
  if (opacity !== null) out.opacity = Math.min(1, Math.max(0.1, opacity));
  return out;
}

interface Row { id: string; type: string; x: number; y: number; z: number; order: number | null; content: Record<string, unknown>; style: unknown }

/**
 * Normalises the get_published_canvas RPC payload into display blocks in document order.
 * Tolerates both the original projection (shape/snake_case styles) and the updated one
 * (content.kind, camelCase styles, content.documentOrder). Images, sources, connectors and
 * groups are never rendered publicly.
 */
export function parsePublishedCanvas(raw: unknown): PublicPage | null {
  if (!isObject(raw)) return null;
  const bg = BACKGROUNDS.includes(raw.background_type as BackgroundType) ? raw.background_type as BackgroundType : "plain";
  const spacing = SPACINGS.includes(Number(raw.background_spacing)) ? Number(raw.background_spacing) : 24;
  const rows: Row[] = (Array.isArray(raw.elements) ? raw.elements : []).flatMap((e): Row[] => {
    if (!isObject(e) || typeof e.id !== "string" || typeof e.type !== "string") return [];
    const content = isObject(e.content_json) ? e.content_json : {};
    return [{ id: e.id, type: e.type, x: num(e.x) ?? 0, y: num(e.y) ?? 0, z: num(e.z_index) ?? 0,
      order: num(content.documentOrder) ?? num(content.document_order), content, style: e.style_json }];
  });
  rows.sort((a, b) => {
    if (a.order !== null || b.order !== null) return a.order === null ? 1 : b.order === null ? -1 : a.order - b.order || a.id.localeCompare(b.id);
    return a.y - b.y || a.x - b.x || a.z - b.z || a.id.localeCompare(b.id);
  });
  const blocks = rows.flatMap((r): PublicBlock[] => {
    const st = style(r.style);
    if (r.type === "text" || r.type === "note") return [{ id: r.id, kind: "text", text: str(r.content.text), note: r.type === "note", style: st }];
    if (r.type === "formula") return [{ id: r.id, kind: "formula", latex: str(r.content.latex, 2000), style: st }];
    if (r.type === "shape" || r.type === "diagram_node") {
      const shape = str(r.content.kind || r.content.shape, 20) || (r.type === "diagram_node" ? "rect" : "rect");
      return [{ id: r.id, kind: "shape", text: str(r.content.text), shape, style: st }];
    }
    return [];
  });
  return { name: str(raw.name, 200) || "Без названия", backgroundType: bg, backgroundSpacing: spacing, blocks };
}
