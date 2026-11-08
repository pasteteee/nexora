"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { data } from "@/lib/data";
import { parsePublishedCanvas, type PublicPage } from "@/lib/publish/projection";
import { StatusScreen } from "@/components/ui/StatusScreen";
import ui from "@/components/ui/ui.module.css";
import { PublicViewer } from "./PublicViewer";

type DemoPublishing = { getPublishedCanvas?: (slug: string) => Promise<unknown> };

/** Демо-режим без Supabase: публикации живут в localStorage этого браузера. */
export function DemoPublicPage({ slug }: { slug: string }) {
  const [state, setState] = useState<{ page: PublicPage | null; done: boolean }>({ page: null, done: false });
  useEffect(() => {
    let alive = true;
    const api = data as unknown as DemoPublishing;
    (api.getPublishedCanvas ? api.getPublishedCanvas(slug) : Promise.resolve(null))
      .then((raw) => { if (alive) setState({ page: parsePublishedCanvas(raw), done: true }); })
      .catch(() => { if (alive) setState({ page: null, done: true }); });
    return () => { alive = false; };
  }, [slug]);
  if (!state.done) return <main role="status" style={{ display: "grid", placeItems: "center", minHeight: "100dvh", color: "var(--ink-2)" }}>Открываем страницу…</main>;
  if (!state.page) return <StatusScreen code="404" text="Ссылка не активна" note="Публикацию могли отключить">
    <Link href="/" className={`${ui.btn} ${ui.primary}`}>На главную</Link>
  </StatusScreen>;
  return <PublicViewer page={state.page} />;
}
