import type { Metadata } from "next";
import { AcceptInvitation } from "./AcceptInvitation";

// Токен приглашения находится в адресе: не передаём его сторонним сайтам и не индексируем.
export const metadata: Metadata = {
  title: "Приглашение — Nexora",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function InvitePage() {
  return <AcceptInvitation />;
}
