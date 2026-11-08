"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import s from "./dock.module.css";

/** Bottom dock of an app screen: navigation and actions in one row. */
export function Dock({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <nav data-dock className={className ? `${s.dock} ${className}` : s.dock} aria-label={label}>{children}</nav>;
}
export function DockGroup({ children, label }: { children: ReactNode; label?: string }) {
  return <div className={s.group} role="group" aria-label={label}>{children}</div>;
}
export const DockSep = () => <span className={s.sep} aria-hidden />;
export const DockCount = ({ children }: { children: ReactNode }) => <span className={s.count}>{children}</span>;

type DockButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  /** Accessible name; shown as a tooltip when there is no visible label */
  tip: string;
  /** Visible text next to the icon (hidden on phones except for the primary button) */
  label?: string;
  active?: boolean;
  primary?: boolean;
};
export const DockButton = forwardRef<HTMLButtonElement, DockButtonProps>(function DockButton(
  { icon, tip, label, active, primary, className, ...rest }, ref,
) {
  return <button ref={ref} type="button" aria-label={tip}
    data-tip={label ? undefined : tip} aria-pressed={active ?? undefined}
    className={[s.btn, primary && s.primary, className].filter(Boolean).join(" ")} {...rest}>
    {icon}{label && <span className={s.label} data-dock-label={primary ? undefined : ""}>{label}</span>}
  </button>;
});

export const dockStyles = s;
