"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { auth, ApiError } from "@/lib/data";
import { useSession } from "@/lib/session";
import { validateName } from "@/lib/validation";
import { Button, Field } from "@/components/ui";
import { EmailVerification } from "@/components/auth/EmailVerification";
import s from "@/components/auth/verification.module.css";

export default function ProfilePage() {
  const { profile, refresh } = useSession();
  const [draftName, setName] = useState<string | null>(null);
  const name = draftName ?? profile?.displayName ?? "";
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void refresh().then(() => {
      if (new URLSearchParams(window.location.search).has("verification"))
        setMessage("Ссылка устарела или открыта в другом браузере. Запросите новое письмо ниже.");
    });
  }, [refresh]);
  async function save(e: FormEvent) {
    e.preventDefault();
    const error = validateName(name);
    if (error) return setMessage(error);
    setBusy(true);
    try { await auth.updateProfile(name); await refresh(); setMessage("Имя сохранено"); }
    catch (e) { setMessage(e instanceof ApiError ? e.message : "Не удалось сохранить имя"); }
    finally { setBusy(false); }
  }
  return <main className={s.page}>
    <Link href="/app">← Мои тетради</Link>
    <h1>Ваш профиль</h1><p>{profile?.email}</p>
    <form onSubmit={save}><label htmlFor="profile-name">Имя</label>
      <Field id="profile-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
      <Button disabled={busy} type="submit">{busy ? "Сохраняем…" : "Сохранить имя"}</Button>
    </form>
    <p role="status">{message}</p><EmailVerification />
  </main>;
}
