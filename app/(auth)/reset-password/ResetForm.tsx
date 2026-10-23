"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Spinner } from "@/components/ui";
import { PasswordField } from "@/components/auth/PasswordField";
import s from "@/components/auth/auth.module.css";
import { auth, consumeToken, demoMode, ApiError } from "@/lib/data";
import { useSession } from "@/lib/session";
import { validatePassword } from "@/lib/validation";

export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const refresh = useSession((x) => x.refresh);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = validatePassword(password) ?? (password !== repeat ? "Пароли не совпадают" : null);
    if (v) return setErr(v);
    setBusy(true); setErr(null);
    try {
      // демо — одноразовый токен из «письма»; Supabase — сессия восстановления из ссылки
      if (demoMode) await consumeToken(token ?? "", "reset", password);
      else await auth.updatePassword(password);
      await refresh();
      router.replace("/app");
    } catch (x) {
      setErr(x instanceof ApiError && x.code === "invalid" ? "Ссылка устарела или уже использована" : "Не удалось сохранить пароль");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }} noValidate>
      {err && <div className={s.error}>{err}{err.startsWith("Ссылка") && <> · <Link href="/forgot-password" style={{ textDecoration: "underline" }}>запросить новую</Link></>}</div>}
      <PasswordField value={password} onChange={setPassword} autoComplete="new-password" placeholder="Новый пароль" />
      <PasswordField value={repeat} onChange={setRepeat} autoComplete="new-password" placeholder="Повторите пароль" />
      <Button type="submit" disabled={busy}>{busy ? <Spinner /> : "Сохранить"}</Button>
    </form>
  );
}
