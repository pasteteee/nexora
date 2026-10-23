"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Field, Spinner } from "@/components/ui";
import { AuthShell } from "@/components/auth/AuthShell";
import { DemoInbox } from "@/components/auth/DemoInbox";
import s from "@/components/auth/auth.module.css";
import { auth } from "@/lib/data";
import { validateEmail } from "@/lib/validation";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = validateEmail(email);
    if (v) return setErr(v);
    setBusy(true); setErr(null);
    await auth.requestPasswordReset(email).catch(() => {});
    setBusy(false);
    setSent((n) => n + 1);
  }

  return (
    <AuthShell title="Восстановить доступ">
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }} noValidate>
        {/* одинаковый ответ для любого адреса */}
        {sent > 0 && <div className={s.ok}>Если адрес зарегистрирован, письмо уже в пути</div>}
        <DemoInbox email={email} tick={sent} />
        <Field type="email" placeholder="E-mail" aria-label="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={err ?? undefined} autoFocus />
        <Button type="submit" disabled={busy}>{busy ? <Spinner /> : "Отправить ссылку"}</Button>
        <div className={s.row}><span /><Link href="/login">Ко входу</Link></div>
      </form>
    </AuthShell>
  );
}
