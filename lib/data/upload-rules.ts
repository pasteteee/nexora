import { ApiError } from "./api";

/** ТЗ п. 4.2.6: форматы, 25 МиБ, 100 источников / 500 МиБ на тетрадь */
export const MAX_FILE = 25 * 1024 * 1024;
export const MAX_SOURCES = 100;
export const MAX_TOTAL = 500 * 1024 * 1024;

const ALLOWED: Record<string, string[]> = {
  pdf: ["application/pdf"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain", "text/x-markdown", ""],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
};
export const SOURCE_ACCEPT = ".pdf,.pptx,.txt,.md,.png,.jpg,.jpeg";
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

export function extOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** MIME для записи источника: браузер часто не знает тип .md */
export function sourceMime(file: { name: string; type: string }) {
  const ext = extOf(file.name);
  if (ext === "md") return "text/markdown";
  return ALLOWED[ext]?.[0] ?? file.type;
}

export function checkUpload(file: { name: string; type: string; size: number }, existing: { size: number }[]) {
  const ext = extOf(file.name);
  const mimes = ALLOWED[ext];
  if (!mimes || (file.type && !mimes.includes(file.type)))
    throw new ApiError("Формат не поддерживается: PDF, PPTX, TXT, MD, PNG, JPEG", "invalid");
  if (file.size > MAX_FILE) throw new ApiError("Файл больше 25 МиБ", "limit");
  if (existing.length >= MAX_SOURCES) throw new ApiError("В тетради уже 100 материалов", "limit");
  if (existing.reduce((s, x) => s + x.size, 0) + file.size > MAX_TOTAL)
    throw new ApiError("Превышен объём тетради 500 МиБ", "limit");
}

export function checkImage(file: { name: string; type: string; size: number }) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new ApiError("Изображение: PNG, JPEG или WebP", "invalid");
  if (file.size > MAX_FILE) throw new ApiError("Файл больше 25 МиБ", "limit");
}
