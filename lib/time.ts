const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

/** «5 минут назад», «вчера», «3 дня назад» */
export function ago(iso: string, now = Date.now()) {
  const sec = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 45) return "только что";
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(sec / 86400), "day");
  return new Date(iso).toLocaleDateString("ru", { day: "numeric", month: "short", year: "numeric" });
}

/** Сколько дней осталось до окончательного удаления из корзины */
export function daysLeft(deletedAt: string, days: number, now = Date.now()) {
  return Math.max(0, Math.ceil((Date.parse(deletedAt) + days * 864e5 - now) / 864e5));
}
