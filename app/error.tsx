"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { StatusScreen } from "@/components/ui/StatusScreen";
import ui from "@/components/ui/ui.module.css";

export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <StatusScreen code="500" text="Что-то пошло не так. Попробуйте ещё раз.">
      <Button onClick={() => unstable_retry()}><RotateCcw size={16} /> Повторить</Button>
      <Link href="/app" className={`${ui.btn} ${ui.secondary}`}><Home size={16} /> Мои тетради</Link>
    </StatusScreen>
  );
}
