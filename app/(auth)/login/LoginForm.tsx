"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Spinner } from "@/components/ui";
import { DemoInbox } from "@/components/auth/DemoInbox";
import { PasswordField } from "@/components/auth/PasswordField";
import s from "@/components/auth/auth.module.css";
import { auth, consumeToken, demoMode, ApiError } from "@/lib/data";
import { useSession } from "@/lib/session";
import { validateEmail } from "@/lib/validation";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const refresh = useSession((x) => x.refresh);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(params.get("confirmed") ? "E-mail подтверждён" : null);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(0);

  // демо: ссылка из «письма» подтверждения
  useEffect(() => {
    const token = params.get("confirm");
    if (!token || !demoMode) return;
    consumeToken(token, "confirm")
      .then(async () => { await refresh(); router.replace("/app"); })
      .catch(() => setErr("Ссылка устарела. Запросите новую."));
  }, [params, refresh, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    if (emailErr || !password) return setErr(emailErr ?? "Введите пароль");
    setBusy(true); setErr(null);
    try {
      await auth.signIn(email, password);
      await refresh();
      router.replace(next.startsWith("/") ? next : "/app");
    } catch (x) {
      const msg = x instanceof ApiError ? x.message : "Нет соединения. Попробуйте ещё раз.";
      setErr(msg);
      if (msg.startsWith("Подтвердите")) setUnconfirmed((n) => n || 1);
    } finally { setBusy(false); }
  }

  async function resend() {
    await auth.resendConfirmation(email);
    setInfo("Письмо отправлено ещё раз");
    setUnconfirmed((n) => n + 1);
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }} noValidate>
      {info && <div className={s.ok}>{info}</div>}
      {err && (
        <div className={s.error}>
          {err}
          {err.startsWith("Подтвердите") && (
            <> · <button type="button" onClick={resend} style={{ border: 0, background: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0 }}>отправить снова</button></>
          )}
        </div>
      )}
      <DemoInbox email={email} tick={unconfirmed} />
      <Field type="email" label="E-mail" placeholder="name@mail.ru" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
      <Button type="submit" disabled={busy}>{busy ? <Spinner /> : "Войти"}</Button>
      <div className={s.row}>
        <Link href="/forgot-password">Забыли пароль?</Link>
        <Link href="/register">Регистрация</Link>
      </div>
    </form>
  );
}
