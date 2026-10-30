"use client";
import { useEffect, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { auth, ApiError } from "@/lib/data";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui";
import { DemoInbox } from "./DemoInbox";
import s from "./verification.module.css";

export function EmailVerification() {
  const { profile, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const reload = () => { void refresh(); };
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [refresh]);
  if (!profile) return null;
  if (profile.emailVerified) return <p className={s.verified}><ShieldCheck size={18} /> Почта подтверждена</p>;
  async function send() {
    if (!profile) return;
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
    <Button variant="ghost" disabled={busy} onClick={send}>{busy ? "Отправляем…" : sent ? "Отправить снова" : "Подтвердить"}</Button>
  </section>;
}
