import type { Metadata, Viewport } from "next";
import "./globals.css";
import { boardFonts } from "@/components/editor/board/fonts";

export const metadata: Metadata = {
  title: {
    default: "Nexora — всё, что вы узнали, в одной тетради",
    template: "%s",
  },
  description:
    "Тетради-хранилища для знаний: заметки, лекции, формулы, графики, фото и файлы в одном месте. Раскладывайте материалы на листе, находите их поиском и задавайте вопросы ИИ-помощнику.",
  applicationName: "Nexora",
  keywords: ["тетрадь онлайн", "хранилище знаний", "база знаний", "заметки", "конспекты", "формулы", "поиск по материалам"],
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Nexora",
    title: "Nexora — всё, что вы узнали, в одной тетради",
    description: "Заметки, лекции, формулы, фото и файлы лежат вместе и находятся поиском.",
  },
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
