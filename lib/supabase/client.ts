"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public";

export function supabaseBrowser() {
  const env = getPublicEnv();
  return createBrowserClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
  );
}
