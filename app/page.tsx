import Link from "next/link";
import katex from "katex";
import "katex/dist/katex.min.css";
import { boardFonts } from "@/components/editor/board/fonts";
import { Catalog } from "@/components/landing/Catalog";
import { FormulaDemo } from "@/components/landing/FormulaDemo";
import { TangentPlot } from "@/components/landing/TangentPlot";
import { LiveSheet, type SheetItem } from "@/components/landing/LiveSheet";
import { toTex } from "@/lib/editor/board/math";
import s from "@/components/landing/landing.module.css";

const formula = katex.renderToString(toTex("f'(x) = lim(h->0) (f(x+h) - f(x))/h"), { displayMode: true, throwOnError: false });

const SHEET: SheetItem[] = [
  {
    id: "text", x: 88, y: 92, className: s.wText, label: "Текст",
    children: "Производная показывает, как быстро меняется функция. Геометрически это наклон касательной.",
  },
  { id: "formula", x: 96, y: 180, className: s.wFormula, label: "Формула", children: <span dangerouslySetInnerHTML={{ __html: formula }} /> },
  {
    id: "plot", x: 396, y: 92, className: `${s.card} ${s.wPlot}`, label: "График y = x²",
    children: <TangentPlot />,
  },
  { id: "note", x: 104, y: 288, className: s.wNote, label: "Заметка", children: "На зачёте спросят геометрический смысл. Нарисовать касательную!" },
  {
    id: "kanban", x: 312, y: 300, className: `${s.card} ${s.wKanban}`, label: "Канбан",
    children: <>
      <div className={s.wLabel}>Канбан</div>
      <div className={s.kb}>
        <div><b>Надо</b><p>№ 214–218</p><p>Вывести (uv)′</p></div>
        <div><b>В работе</b><p>Таблица производных</p></div>
        <div><b>Готово</b><p>Пределы, § 3</p></div>
      </div>
    </>,
  },
  { id: "deadline", x: 104, y: 468, className: `${s.card} ${s.wDl}`, label: "Дедлайн", children: <>Коллоквиум по матанализу <b>через 4 дня</b></> },
];

export default function Landing() {
  return (
    <div className={`${s.page} ${boardFonts}`}>
      <div className={s.wrap}>
        <nav className={s.nav} aria-label="Главное">
          <Link className={s.brand} href="/"><i aria-hidden="true" />Nexora</Link>
          <Link className={`${s.btn} ${s.quiet}`} href="/login">Войти</Link>
          <Link className={`${s.btn} ${s.primary}`} href="/register">Создать тетрадь</Link>
        </nav>

        <header className={s.hero}>
          <div>
            <h1>Тетрадь, где каждый блок можно передвинуть</h1>
            <p className={s.lead}>Конспект, формулы, канбан и график на одном листе. Возьмите любой виджет и положите туда, где удобно.</p>
            <div className={s.ctaRow}>
              <Link className={`${s.btn} ${s.primary}`} href="/register">Создать тетрадь</Link>
              <Link className={`${s.btn} ${s.quiet}`} href="/login">У меня есть аккаунт</Link>
            </div>
            <ul className={s.keys} aria-label="Как пользоваться">
              <li><span><kbd>/</kbd></span>Выбрать виджет прямо из строки</li>
              <li><span><kbd>⠿</kbd></span>Перетащить блок в любое место листа</li>
              <li><span><kbd>Ctrl</kbd> <kbd>Z</kbd></span>Отменить, даже после перетаскивания</li>
            </ul>
          </div>
          <LiveSheet title="Лекция 3. Производная" items={SHEET} demo="deadline" />
        </header>
      </div>

      <main>
        <section className={s.band} aria-labelledby="fx-h">
          <div className={`${s.wrap} ${s.fx}`}>
            <div>
              <h2 id="fx-h">Формулы пишутся как в калькуляторе</h2>
              <p className={s.sub}>Без LaTeX. Наберите <code>sqrt(x)</code> или «корень», дробь через косую черту. Если ошибка, формула подскажет где.</p>
            </div>
            <FormulaDemo />
          </div>
        </section>

        <section className={s.band} aria-labelledby="cat-h">
          <div className={s.wrap}>
            <Catalog />
          </div>
        </section>

        <section className={s.final} aria-labelledby="fin-h">
          <div className={s.wrap}>
            <h2 id="fin-h">Начните конспект следующей лекции здесь</h2>
            <Link className={s.btn} href="/register">Создать тетрадь</Link>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.wrap}><span>Nexora</span><span>Тетради для учёбы с формулами, схемами и планом</span></div>
      </footer>
    </div>
  );
}
