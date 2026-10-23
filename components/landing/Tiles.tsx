"use client";
import { FileText, MousePointerClick, Sparkles, Share2 } from "lucide-react";
import s from "./landing.module.css";

const TILES = [
  { Icon: MousePointerClick, title: "Свободный холст", text: "Текст, стикеры, формулы, картинки и связи — где угодно и в любом масштабе." },
  { Icon: FileText, title: "Свои материалы", text: "PDF, DOCX, презентации и фото — фрагмент прямо на холст со ссылкой на источник." },
  { Icon: Sparkles, title: "ИИ по источникам", text: "Ответы и конспекты со ссылками на страницы ваших файлов." },
  { Icon: Share2, title: "Вместе", text: "Совместная работа в реальном времени и публикация по ссылке." },
];

export function Tiles() {
  return (
    <section className={s.tiles}>
      {TILES.map(({ Icon, title, text }) => (
        <article
          key={title}
          className={s.tile}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
            e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
          }}
        >
          <Icon className={s.big} size={30} strokeWidth={1.6} />
          <b>{title}</b>
          <p>{text}</p>
        </article>
      ))}
    </section>
  );
}
