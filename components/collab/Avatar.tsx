import { colorFor } from "@/lib/realtime/session";
import s from "./collab.module.css";

export const initials = (name: string) =>
  name.trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || "?";

export function Avatar({ id, name, color, title }: { id: string; name: string; color?: string; title?: string }) {
  return <span className={s.avatar} style={{ ["--c" as string]: color ?? colorFor(id) }} title={title ?? name} aria-hidden={!title}>
    {initials(name)}
  </span>;
}
