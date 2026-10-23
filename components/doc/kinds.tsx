import {
  Code2, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, MessageSquareText, Minus, Pilcrow, Sigma, TextQuote,
  type LucideIcon,
} from "lucide-react";
import type { BlockKind, Tint } from "@/lib/doc/model";

export const KIND_META: Record<BlockKind, { label: string; hint: string; keys: string; Icon: LucideIcon; md?: string }> = {
  p: { label: "Текст", hint: "Обычный абзац", keys: "текст абзац text p", Icon: Pilcrow },
  h1: { label: "Заголовок 1", hint: "Тема лекции", keys: "заголовок h1 heading", Icon: Heading1, md: "#" },
  h2: { label: "Заголовок 2", hint: "Раздел", keys: "заголовок h2 heading", Icon: Heading2, md: "##" },
  h3: { label: "Заголовок 3", hint: "Подраздел", keys: "заголовок h3 heading", Icon: Heading3, md: "###" },
  bullet: { label: "Список", hint: "Пункты с точками", keys: "список маркированный bullet list ul", Icon: List, md: "-" },
  numbered: { label: "Нумерованный список", hint: "1, 2, 3…", keys: "нумерованный список numbered ol", Icon: ListOrdered, md: "1." },
  todo: { label: "Задачи", hint: "Список с галочками", keys: "задачи чекбокс todo check", Icon: ListTodo, md: "[]" },
  quote: { label: "Цитата", hint: "Выдержка из источника", keys: "цитата quote", Icon: TextQuote, md: ">" },
  callout: { label: "Выноска", hint: "Важное на цветном фоне", keys: "выноска важно callout note", Icon: MessageSquareText },
  code: { label: "Код", hint: "Моноширинный блок", keys: "код code", Icon: Code2, md: "```" },
  formula: { label: "Формула", hint: "TeX, например E = mc^2", keys: "формула tex latex math", Icon: Sigma, md: "$$" },
  divider: { label: "Разделитель", hint: "Горизонтальная линия", keys: "разделитель линия divider hr", Icon: Minus, md: "---" },
};

export const TINT_LABEL: Record<Tint, string> = {
  yellow: "Жёлтый маркер",
  green: "Зелёный маркер",
  blue: "Голубой маркер",
  pink: "Розовый маркер",
  gray: "Серый фон",
};

/** Подпись-заглушка пустого блока */
export const PLACEHOLDER: Partial<Record<BlockKind, string>> = {
  p: "Пишите или введите «/» для команд",
  h1: "Заголовок 1",
  h2: "Заголовок 2",
  h3: "Заголовок 3",
  bullet: "Пункт списка",
  numbered: "Пункт списка",
  todo: "Задача",
  quote: "Цитата",
  callout: "Важное",
  code: "Код",
  formula: "Формула в TeX, например \\oint E\\,dl = -\\frac{d\\Phi}{dt}",
};

/** Markdown-сокращения в начале строки: «# » → заголовок и т. д. */
export const MD_SHORTCUTS: [string, BlockKind][] = [
  ["###", "h3"], ["##", "h2"], ["#", "h1"],
  ["-", "bullet"], ["*", "bullet"], ["1.", "numbered"],
  ["[]", "todo"], ["[ ]", "todo"], [">", "quote"], ["!", "callout"], ["$$", "formula"],
];
