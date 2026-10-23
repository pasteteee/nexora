"use client";
import { Mail } from "lucide-react";
import Link from "next/link";
import { demoMode, localAuth } from "@/lib/data";
import s from "./auth.module.css";

/** Только демо-режим: вместо настоящего письма показываем ссылку из «почтового ящика». */
export function DemoInbox({ email, tick }: { email: string; tick: number }) {
  if (!demoMode || !tick) return null;
  const mail = localAuth.demoInbox(email);
  if (!mail) return null;
  return (
    <Link href={mail.url} className={s.inbox}>
      <Mail size={16} /> {mail.kind === "confirm" ? "Демо-письмо: подтвердить e-mail" : "Демо-письмо: задать новый пароль"}
    </Link>
  );
}
