import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/config";
import { isValidSlug, parsePublishedCanvas, type PublicPage } from "@/lib/publish/projection";
import { PublicViewer } from "@/components/public/PublicViewer";
import { DemoPublicPage } from "@/components/public/DemoPublicPage";

/** Публичный read-only просмотр опубликованной страницы (ТЗ 4.2.10, прил. 3: GET /p/:slug). */
const loadPublished = cache(async (slug: string): Promise<PublicPage | null> => {
  if (!isValidSlug(slug)) return null;
  const { supabaseServer } = await import("@/lib/supabase/server");
  const supabase = await supabaseServer();
  // The RPC is a whitelist projection: no sources, storage paths, AI history or service fields.
  const { data, error } = await supabase.rpc("get_published_canvas", { p_slug: slug });
  if (error) throw new Error("Не удалось загрузить публичную страницу");
  return parsePublishedCanvas(data);
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = isSupabaseConfigured ? await loadPublished(slug).catch(() => null) : null;
  return {
    title: page ? `${page.name} · Nexora` : "Публичная страница · Nexora",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function PublicPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  if (!isSupabaseConfigured) return <DemoPublicPage slug={slug} />;
  const page = await loadPublished(slug);
  if (!page) notFound();
  return <PublicViewer page={page} />;
}
