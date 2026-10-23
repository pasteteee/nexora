import Link from "next/link";
import { Home } from "lucide-react";
import { StatusScreen } from "@/components/ui/StatusScreen";
import ui from "@/components/ui/ui.module.css";

export default function NotFound() {
  return (
    <StatusScreen code="404" text="Такой страницы нет или у вас нет к ней доступа" note="Возможно, её переместили в корзину">
      <Link href="/app" className={`${ui.btn} ${ui.primary}`}><Home size={16} /> Мои тетради</Link>
    </StatusScreen>
  );
}
