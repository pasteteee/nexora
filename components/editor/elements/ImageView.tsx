"use client";
import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { imageUrl } from "@/lib/data";
import type { CanvasElement } from "@/lib/types";
import s from "./elements.module.css";

/** Изображение: в демо-режиме — data URL, иначе — подписанная ссылка на приватное хранилище */
export function ImageView({ el }: { el: CanvasElement }) {
  const inline = el.content.dataUrl as string | undefined;
  const path = el.content.path as string | undefined;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (inline || !path) return;
    let alive = true;
    imageUrl(path).then((u) => alive && setUrl(u)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [inline, path]);

  const src = inline ?? url;
  if (failed || (!inline && !path)) return <div className={s.imageMissing}><ImageOff size={24} /></div>;
  if (!src) return <div className={s.imageLoading} />;
  // eslint-disable-next-line @next/next/no-img-element -- приватные подписанные ссылки, оптимизатор Next не нужен
  return <img className={s.image} src={src} alt={String(el.content.name ?? "")} draggable={false} />;
}
