"use client";
import { StatusScreen } from "@/components/ui/StatusScreen";
import ui from "@/components/ui/ui.module.css";

export default function PublicError({ retry }: { error: unknown; retry(): void }) {
  return <StatusScreen code="Ой" text="Не удалось загрузить публичную страницу. Проверьте соединение и попробуйте снова.">
    <button className={`${ui.btn} ${ui.primary}`} onClick={() => retry()}>Повторить</button>
  </StatusScreen>;
}
