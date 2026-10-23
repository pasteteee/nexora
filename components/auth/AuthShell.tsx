import Link from "next/link";
import type { ReactNode } from "react";
import s from "./auth.module.css";

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={s.screen}>
      <header className={s.top}>
        <Link href="/" className={s.logo}>Nexora</Link>
      </header>
      <main className={s.card}>
        <h1 className={s.title}>{title}</h1>
        {children}
      </main>
    </div>
  );
}
