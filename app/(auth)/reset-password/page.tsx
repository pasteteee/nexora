import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "Новый пароль · Nexora" };

export default function ResetPage() {
  return (
    <AuthShell title="Новый пароль">
      <Suspense><ResetForm /></Suspense>
    </AuthShell>
  );
}
