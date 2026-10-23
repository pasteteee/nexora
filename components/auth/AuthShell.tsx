import Link from "next/link";
import type { ReactNode } from "react";
import s from "./auth.module.css";

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={s.screen}>
      <Link href="/" className={s.logo}><span className={s.mark} />Nexora</Link>
      <span className={`${s.float} ${s.n1}`} />
      <span className={`${s.float} ${s.n2}`} />
      <span className={`${s.float} ${s.n3}`} />
      <span className={`${s.float} ${s.n4}`} />
      <svg className={s.line} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M 22 30 C 40 14, 62 14, 82 24" fill="none" stroke="currentColor" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        <path d="M 26 82 C 44 92, 66 90, 86 76" fill="none" stroke="currentColor" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
      </svg>
      <section className={s.card}>
        <h1 className={s.title}>{title}</h1>
        {children}
      </section>
    </main>
  );
}
