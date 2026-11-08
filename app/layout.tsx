import type { Metadata, Viewport } from "next";
import "./globals.css";
import { boardFonts } from "@/components/editor/board/fonts";

export const metadata: Metadata = {
  title: "Nexora",
  description: "Свободный холст для знаний, материалов и идей",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f3f0" },
    { media: "(prefers-color-scheme: dark)", color: "#121417" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={boardFonts}>
      <body>{children}</body>
    </html>
  );
}
