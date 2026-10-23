import Link from "next/link";
import { LiveDemo } from "@/components/landing/LiveDemo";
import s from "@/components/landing/landing.module.css";

const HOW = [
  { keys: ["/"], text: "Выбрать блок: заголовок, список, формулу, задачу" },
  { keys: ["⋮⋮"], text: "Потянуть абзац выше, ниже или в колонку рядом" },
  { keys: ["Ctrl", "Shift", "↑"], text: "Сдвинуть строку без мыши" },
];

export default function Landing() {
  return (
    <div className={s.page}>
      <header className={s.nav}>
        <span className={s.brand}>Nexora</span>
        <nav className={s.navLinks}>
          <Link className={s.link} href="/login">Войти</Link>
          <Link className={s.cta} href="/register">Создать тетрадь</Link>
        </nav>
      </header>

      <main className={s.hero}>
        <section className={s.copy}>
          <h1 className={s.headline}>Конспекты, которые можно двигать</h1>
          <p className={s.lede}>Пишите лекцию сверху вниз, как в тетради. Абзац не на месте — перетащите его за ручку на полях.</p>
          <div className={s.actions}>
            <Link className={s.cta} href="/register">Создать тетрадь</Link>
            <Link className={s.link} href="/login">У меня есть аккаунт</Link>
          </div>
          <dl className={s.how}>
            {HOW.map((h) => (
              <div key={h.text} className={s.howRow}>
                <dt>{h.keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
                <dd>{h.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={s.demo} aria-label="Попробуйте редактор">
          <LiveDemo />
          <p className={s.caption}>Это настоящий редактор. Наведите на абзац и потяните за <kbd>⋮⋮</kbd> на полях.</p>
        </section>
      </main>

      <footer className={s.footer}>
        <span>Nexora — тетради для учёбы</span>
        <span>2026</span>
      </footer>
    </div>
  );
}
