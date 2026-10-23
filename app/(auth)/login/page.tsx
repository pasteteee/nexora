import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Вход · Nexora" };

export default function LoginPage() {
  return (
    <AuthShell title="С возвращением">
      <Suspense><LoginForm /></Suspense>
    </AuthShell>
  );
}
