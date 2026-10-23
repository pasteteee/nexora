import type { ReactNode } from "react";
import s from "./status.module.css";

export function StatusScreen({ code, text, note, children }: { code: string; text: string; note?: string; children: ReactNode }) {
  return (
    <main className={s.screen}>
      <div className={s.inner}>
        <div className={s.code}>Ошибка {code}</div>
        <h1 className={s.text}>{text}</h1>
        {note && <p className={s.note}>{note}</p>}
        <div className={s.actions}>{children}</div>
      </div>
    </main>
  );
}
