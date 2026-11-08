/** Имя для профиля из данных OAuth-провайдера (Google кладёт full_name и name). */
export function oauthDisplayName(meta: Record<string, unknown> | null | undefined): string {
  if (!meta) return "";
  for (const key of ["display_name", "full_name", "name"]) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120);
  }
  return "";
}
