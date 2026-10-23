"use client";
import { useState } from "react";
import { DocEditor } from "@/components/doc/DocEditor";
import { newBlock, type Block, type BlockKind } from "@/lib/doc/model";
import { useDoc } from "@/lib/doc/store";
import s from "./landing.module.css";

const PAGE = "demo";
const ROW = "demo-row";

function b(kind: BlockKind, text: string, extra: Partial<Block> = {}): Block {
  return { ...newBlock(PAGE, kind, text), ...extra };
}

/** Конспект лекции — настоящий редактор, только без сохранения */
function demoBlocks(): Block[] {
  const list: Block[] = [
    b("p", "Явление открыл <b>Майкл Фарадей</b> в 1831 году: в замкнутом контуре появляется ток, если меняется магнитный поток через него."),
    b("formula", "\\mathcal{E} = -\\frac{d\\Phi}{dt}"),
    b("h3", "Опыт Фарадея", { row: ROW, col: 0 }),
    b("bullet", "Магнит вдвигают в катушку", { row: ROW, col: 0 }),
    b("bullet", "Стрелка гальванометра отклоняется", { row: ROW, col: 0 }),
    b("h3", "Правило Ленца", { row: ROW, col: 1 }),
    b("p", "Индукционный ток направлен так, чтобы <i>мешать</i> изменению потока.", { row: ROW, col: 1 }),
    b("callout", "На экзамене: чем ЭДС индукции отличается от ЭДС самоиндукции", { tint: "yellow" }),
    b("todo", "Переписать вывод формулы, §34", { checked: true }),
    b("todo", "Решить задачи 34.2 и 34.5"),
  ];
  return list.map((x, i) => ({ ...x, order: (i + 1) * 1024 }));
}

export function LiveDemo() {
  // стор заполняется один раз в браузере; на сервере лист пустой той же высоты
  useState(() => {
    if (typeof window !== "undefined") useDoc.getState().init({ pageId: PAGE, canEdit: true, blocks: demoBlocks(), persist: false });
  });

  return (
    <div className={s.sheet}>
      <div className={s.sheetTitle}>Лекция 7. Электромагнитная индукция</div>
      <DocEditor showHandles />
    </div>
  );
}
