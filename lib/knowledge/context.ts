export type ContextElement = {
  id: string;
  x: number;
  y: number;
  content_json: Record<string, unknown>;
};
export function boundedContext(
  selected: ContextElement[],
  nearby: ContextElement[],
) {
  const selectedIds = new Set(selected.map((e) => e.id));
  const text = (e: ContextElement) => ({
    id: e.id,
    text: String(e.content_json.text || e.content_json.latex || "").slice(
      0,
      3000,
    ),
  });
  return {
    selected: selected.slice(0, 20).map(text),
    nearby: nearby
      .filter((e) => !selectedIds.has(e.id))
      .map((e) => ({
        e,
        d: Math.min(...selected.map((s) => Math.hypot(s.x - e.x, s.y - e.y))),
      }))
      .filter((r) => r.d <= 500)
      .sort((a, b) => a.d - b.d || a.e.id.localeCompare(b.e.id))
      .slice(0, 3)
      .map((r) => text(r.e)),
  };
}
