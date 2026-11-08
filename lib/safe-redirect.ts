/**
 * Адрес возврата после входа: только путь внутри приложения.
 * Отсекает «//evil.example», «/\evil.example», схемы и управляющие символы (открытый редирект).
 */
export function safeNext(value: string | null | undefined, fallback = "/app"): string {
  if (!value || value.length > 2048) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://nexora.invalid");
    if (url.origin !== "https://nexora.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
