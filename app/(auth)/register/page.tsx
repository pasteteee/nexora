"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Field, Spinner } from "@/components/ui";
import { AuthShell } from "@/components/auth/AuthShell";
import { DemoInbox } from "@/components/auth/DemoInbox";
import { PasswordField } from "@/components/auth/PasswordField";
import s from "@/components/auth/auth.module.css";
import { auth, ApiError } from "@/lib/data";
import { validateEmail, validateName, validatePassword } from "@/lib/validation";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = { name: validateName(name), email: validateEmail(email), password: validatePassword(password) };
    setErrors(v);
    if (v.name || v.email || v.password) return;
    setBusy(true); setErr(null);
    try {
      await auth.signUp(email, password, name);
      setSent((n) => n + 1);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Нет соединения. Попробуйте ещё раз.");
    } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <AuthShell title="Проверьте почту">
        <div className={s.ok}>Мы отправили ссылку на {email}</div>
        <DemoInbox email={email} tick={sent} />
        <Button variant="ghost" onClick={async () => { await auth.resendConfirmation(email); setSent((n) => n + 1); }}>Отправить снова</Button>
        <div className={s.row}><span /><Link href="/login">Ко входу</Link></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Создать аккаунт">
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }} noValidate>
        {err && <div className={s.error}>{err}</div>}
        <Field placeholder="Имя" aria-label="Имя" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name ?? undefined} autoFocus />
        <Field type="email" placeholder="E-mail" aria-label="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email ?? undefined} />
        <PasswordField value={password} onChange={setPassword} autoComplete="new-password" error={errors.password ?? undefined} />
        <Button type="submit" disabled={busy}>{busy ? <Spinner /> : "Зарегистрироваться"}</Button>
        <div className={s.row}><span>Уже есть аккаунт?</span><Link href="/login">Войти</Link></div>
      </form>
    </AuthShell>
  );
}
