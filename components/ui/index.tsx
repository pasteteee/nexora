"use client";
import {
  forwardRef, useEffect, useLayoutEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import s from "./ui.module.css";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

/* ---------- IconButton: иконка + подсказка по наведению ---------- */
type IconBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tip: string;
  active?: boolean;
  tipSide?: "bottom" | "right";
};
export const IconButton = forwardRef<HTMLButtonElement, IconBtnProps>(function IconButton(
  { tip, active, tipSide = "bottom", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={tip}
      data-tip={tip}
      aria-pressed={active ?? undefined}
      className={cx(s.iconBtn, tipSide === "right" && s.tipRight, className)}
      {...rest}
    >
      {children}
    </button>
  );
});

/* ---------- Group: объединённые кнопки в одной «пилюле» ---------- */
export function Group({ children, vertical, className, ...rest }:
  { children: ReactNode; vertical?: boolean; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div role="toolbar" className={cx(s.group, vertical && s.vertical, className)} {...rest}>{children}</div>;
}
export const Sep = () => <span className={s.sep} aria-hidden />;

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };
export function Button({ variant = "primary", className, ...rest }: BtnProps) {
  const v = variant === "primary" ? s.primary : variant === "danger" ? s.dangerBtn : s.ghost;
  return <button type="button" className={cx(s.btn, v, className)} {...rest} />;
}

/* ---------- Field ---------- */
type FieldProps = InputHTMLAttributes<HTMLInputElement> & { error?: string; hint?: string };
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ error, hint, ...rest }, ref) {
  return (
    <label className={s.field}>
      <input ref={ref} className={s.input} aria-invalid={!!error} {...rest} />
      {error ? <span className={s.err}>{error}</span> : hint ? <span className={s.hint}>{hint}</span> : null}
    </label>
  );
});

/* ---------- Dialog ---------- */
export function Dialog({ open, title, children, actions, onClose }:
  { open: boolean; title: string; children?: ReactNode; actions: ReactNode; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className={s.backdrop} onMouseDown={onClose}>
      <div role="dialog" aria-modal aria-label={title} className={s.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className={s.dialogTitle}>{title}</h2>
        {children && <div className={s.dialogBody}>{children}</div>}
        <div className={s.dialogActions}>{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Menu (контекстное и «⋯») ---------- */
export type MenuItem =
  | { sep: true }
  | { label: string; icon?: ReactNode; kbd?: string; danger?: boolean; onSelect: () => void; hidden?: boolean };

export function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8),
    });
    el.querySelector<HTMLButtonElement>("button")?.focus();
  }, [x, y]);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);
  const visible = items.filter((i) => !("hidden" in i && i.hidden));
  return createPortal(
    <div ref={ref} role="menu" className={s.menu} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {visible.map((it, i) =>
        "sep" in it ? (
          <div key={i} className={s.menuSep} />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={cx(s.menuItem, it.danger && s.menuDanger)}
            onClick={() => { onClose(); it.onSelect(); }}
          >
            {it.icon}
            <span>{it.label}</span>
            {it.kbd && <kbd>{it.kbd}</kbd>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/* ---------- Toast ---------- */
type Toast = { id: number; text: string; action?: { label: string; run: () => void } };
export const useToasts = create<{ list: Toast[]; push: (t: Omit<Toast, "id">) => void; drop: (id: number) => void }>((set) => ({
  list: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((st) => ({ list: [...st.list, { ...t, id }] }));
    setTimeout(() => set((st) => ({ list: st.list.filter((x) => x.id !== id) })), 5000);
  },
  drop: (id) => set((st) => ({ list: st.list.filter((x) => x.id !== id) })),
}));
export const toast = (text: string, action?: Toast["action"]) => useToasts.getState().push({ text, action });

export function Toasts() {
  const { list, drop } = useToasts();
  return (
    <div className={s.toasts} aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={s.toast}>
          <span>{t.text}</span>
          {t.action && <button onClick={() => { t.action!.run(); drop(t.id); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

/* ---------- Skeleton / Spinner ---------- */
export const Skeleton = ({ w = "100%", h = 16, r }: { w?: number | string; h?: number | string; r?: number }) => (
  <div className={s.skeleton} style={{ width: w, height: h, borderRadius: r }} aria-hidden />
);
export const Spinner = () => <span className={s.spinner} role="status" aria-label="Загрузка" />;
