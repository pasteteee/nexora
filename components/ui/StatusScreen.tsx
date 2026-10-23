import type { ReactNode } from "react";
import s from "./status.module.css";

export function StatusScreen({ code, text, note, children }: { code: string; text: string; note?: string; children: ReactNode }) {
  return (
    <main className={s.screen}>
      {note && <div className={s.sticker}>{note}</div>}
      <div>
        <div className={s.code}>{code}</div>
        <p className={s.text}>{text}</p>
        <div className={s.actions}>{children}</div>
      </div>
    </main>
  );
}
