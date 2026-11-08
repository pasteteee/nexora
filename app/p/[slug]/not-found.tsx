import Link from "next/link";
import { StatusScreen } from "@/components/ui/StatusScreen";
import ui from "@/components/ui/ui.module.css";

export default function PublicNotFound() {
  return <StatusScreen code="404" text="Ссылка не активна или страницы не существует" note="Публикацию могли отключить">
    <Link href="/" className={`${ui.btn} ${ui.primary}`}>На главную</Link>
  </StatusScreen>;
}
