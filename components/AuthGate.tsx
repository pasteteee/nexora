"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Spinner, Toasts } from "@/components/ui";
import { useSession } from "@/lib/session";

/** Закрытая зона: без сессии — на вход с возвратом на исходный адрес */
export function AuthGate({ children }: { children: ReactNode }) {
  const { profile, ready, refresh } = useSession();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => { if (!ready) refresh(); }, [ready, refresh]);
  useEffect(() => {
    if (ready && !profile) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, profile, path, router]);

  if (!ready || !profile) return <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center" }}><Spinner /></div>;
  return <>{children}<Toasts /></>;
}
