"use client";
import { useEffect, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { auth, ApiError } from "@/lib/data";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui";
import { DemoInbox } from "./DemoInbox";
import s from "./verification.module.css";

const cooldowns = new Map<string, number>();
function cooldownUntil(email: string, reference: number) {
  let stored = 0;
  try { stored = Number(localStorage.getItem(`nexora:verify:${email.toLowerCase()}`)) || 0; } catch { /* storage may be unavailable */ }
  // Ignore malformed or stale clocks rather than disabling the action indefinitely.
  const until = Math.max(cooldowns.get(email) || 0, stored);
  return Number.isFinite(until) && until <= reference + 60_000 ? until : 0;
}

export function EmailVerification() {
  const { profile, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now);
  const email = profile?.email ?? "";
  const remaining = Math.max(0, Math.ceil((cooldownUntil(email, now) - now) / 1000));
  useEffect(() => {
    if (!email || profile?.emailVerified) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [email, profile?.emailVerified]);
  useEffect(() => {
    const reload = () => { void refresh(); };
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [refresh]);
  if (!profile) return null;
  if (profile.emailVerified) return <p className={s.verified}><ShieldCheck size={18} /> Почта подтверждена</p>;
  async function send() {
    const attemptedAt = Date.now();
    if (!profile || busy || cooldownUntil(profile.email, attemptedAt) > attemptedAt) return;
    const until = attemptedAt + 60_000;
    cooldowns.set(profile.email, until);
    try { localStorage.setItem(`nexora:verify:${profile.email.toLowerCase()}`, String(until)); } catch { /* in-memory cooldown still applies */ }
    setNow(attemptedAt);
    setBusy(true); setMessage("");
    try {
      await auth.resendConfirmation(profile.email);
      setSent((n) => n + 1);
      setMessage("Ссылка отправлена. Откройте письмо в этом браузере. Проверьте также папку «Спам».");
    } catch (e) { setMessage(e instanceof ApiError ? e.message : "Не удалось отправить письмо. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  return <section className={s.banner} aria-label="Подтверждение почты">
    <Mail size={23} aria-hidden="true" />
    <div className={s.body}><strong>Подтвердите почту</strong><p>{profile.email} · Тетради уже доступны. Подтверждение поможет защитить ваш аккаунт.</p>
      <span role="status">{message}</span><DemoInbox email={profile.email} tick={sent} />
    </div>
    <Button variant="ghost" disabled={busy || remaining > 0} onClick={send}>{busy ? "Отправляем…" : remaining > 0 ? `Повторить через ${remaining} с` : sent ? "Отправить снова" : "Подтвердить"}</Button>
  </section>;
}
