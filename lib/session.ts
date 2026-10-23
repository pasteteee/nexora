"use client";
import { create } from "zustand";
import type { Profile } from "@/lib/types";
import { auth } from "@/lib/data";

type S = { profile: Profile | null; ready: boolean; refresh(): Promise<Profile | null>; signOut(): Promise<void> };

export const useSession = create<S>((set) => ({
  profile: null,
  ready: false,
  async refresh() {
    const profile = await auth.current().catch(() => null);
    set({ profile, ready: true });
    return profile;
  },
  async signOut() {
    await auth.signOut();
    set({ profile: null });
  },
}));
