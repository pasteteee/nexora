/** ТЗ 4.2.10: области больше 10 000 × 10 000 мировых единиц не экспортируются. */
export const MAX_EXPORT_SIDE = 10_000;
export const AREA_TOO_LARGE = "Выберите меньшую область";

export function checkExportArea(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "Нечего экспортировать";
  return width > MAX_EXPORT_SIDE || height > MAX_EXPORT_SIDE ? AREA_TOO_LARGE : null;
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
const translit = (text: string) => [...text].map((ch) => {
  const low = ch.toLowerCase(), out = TRANSLIT[low];
  if (out === undefined) return ch;
  return ch === low ? out : out.charAt(0).toUpperCase() + out.slice(1);
}).join("");

/**
 * Имя файла из названия страницы. Только ASCII: Chromium отбрасывает не-ASCII имена
 * из атрибута download у blob-ссылок и сохраняет файл как «download» без расширения.
 */
export function exportFileName(name: string, ext: "png" | "pdf" | "json", now = new Date()): string {
  const base = translit(name.normalize("NFC")).normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 80) || "Nexora page";
  const date = now.toISOString().slice(0, 10);
  return `${base} ${date}.${ext}`;
}
