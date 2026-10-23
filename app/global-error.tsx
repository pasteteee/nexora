"use client";
import "./globals.css";
import ErrorPage from "./error";

export default function GlobalError(props: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="ru">
      <body><ErrorPage {...props} /></body>
    </html>
  );
}
