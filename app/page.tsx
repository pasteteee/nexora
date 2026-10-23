import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DemoCanvas } from "@/components/landing/DemoCanvas";
import { Tiles } from "@/components/landing/Tiles";
import s from "@/components/landing/landing.module.css";

export default function Landing() {
  return (
    <main className={s.page}>
      <nav className={s.nav}>
        <span className={s.brand}><span className={s.mark} />Nexora</span>
        <Link className={s.navLink} href="/login">Войти</Link>
        <Link className={s.cta} href="/register">Начать <ArrowRight size={15} /></Link>
      </nav>
      <DemoCanvas />
      <Tiles />
      <section className={s.final}>
        <div>
          <h2>Всё, что вы изучаете,<br />на одном холсте</h2>
          <Link href="/register">Создать тетрадь <ArrowRight size={16} /></Link>
        </div>
      </section>
    </main>
  );
}
