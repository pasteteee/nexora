"use client";
import { useEffect, useState } from "react";
import { demoMode } from "@/lib/data";

export type AiAccessState = { enabled: boolean; admin: boolean; perHour: number; reason: string | null };

// One request per page load: the answer only changes when the server config or the account changes.
let pending: Promise<AiAccessState> | null = null;
function load(): Promise<AiAccessState> {
  pending ??= fetch("/api/ai/access", { cache: "no-store" })
    .then(async (res) => (await res.json()) as AiAccessState)
    .catch(() => {
      pending = null;
      return { enabled: true, admin: false, perHour: 0, reason: null };
    });
  return pending;
}

/**
 * Whether the AI features are open to this user. null while loading and in demo mode (the demo explains itself).
 * The server checks again on every request; this only keeps the UI honest.
 */
export function useAiAccess(): AiAccessState | null {
  const [state, setState] = useState<AiAccessState | null>(null);
  useEffect(() => {
    if (demoMode) return;
    let live = true;
    void load().then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, []);
  return state;
}
