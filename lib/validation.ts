/** Правила ТЗ п. 4.2.2–4.2.3 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(v: string) {
  return EMAIL_RE.test(v.trim()) ? null : "Введите корректный e-mail";
}
export function validateName(v: string) {
  const n = v.trim().length;
  return n >= 1 && n <= 50 ? null : "От 1 до 50 символов";
}
export function validatePassword(v: string) {
  if (v.length < 8) return "Минимум 8 символов";
  if (!/[a-zA-Zа-яА-ЯёЁ]/.test(v) || !/\d/.test(v)) return "Нужны буква и цифра";
  return null;
}
export function validateTitle(v: string) {
  const n = v.trim().length;
  return n >= 1 && n <= 100 ? null : "От 1 до 100 символов";
}
