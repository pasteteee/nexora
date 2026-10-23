"use client";
/** Простая разметка внутри блока и работа с кареткой в contentEditable */

const ALLOWED: Record<string, string> = { B: "b", STRONG: "b", I: "i", EM: "i", U: "u", S: "s", STRIKE: "s", CODE: "code", A: "a", BR: "br" };

/** Оставляет только b, i, u, s, code, a[href] и br; остальное разворачивает в текст */
export function sanitize(html: string): string {
  if (!html || !/[<&]/.test(html)) return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walk = (node: Node): string => {
    let out = "";
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) { out += escapeText(n.textContent ?? ""); return; }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const el = n as HTMLElement;
      const tag = ALLOWED[el.tagName];
      // блочные теги из вставки — перенос строки
      if (!tag) { out += walk(el) + (/^(DIV|P|LI|H\d)$/.test(el.tagName) && el.nextSibling ? "<br>" : ""); return; }
      if (tag === "br") { out += "<br>"; return; }
      const inner = walk(el);
      if (!inner) return;
      if (tag === "a") {
        const href = el.getAttribute("href") ?? "";
        out += /^(https?:|mailto:)/i.test(href) ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner;
        return;
      }
      out += `<${tag}>${inner}</${tag}>`;
    });
    return out;
  };
  const out = walk(tpl.content);
  // одиночный <br>, который браузер оставляет в пустом поле, — это пустота
  return out === "<br>" ? "" : out;
}

export const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Текст без разметки */
export function plain(html: string): string {
  if (!/[<&]/.test(html)) return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html.replace(/<br\s*\/?>/g, "\n");
  return tpl.content.textContent ?? "";
}

/** Длина текста узла с учётом <br> как одного символа */
function nodeLength(n: Node): number {
  if (n.nodeType === Node.TEXT_NODE) return n.textContent?.length ?? 0;
  if ((n as Element).tagName === "BR") return 1;
  let len = 0;
  n.childNodes.forEach((c) => (len += nodeLength(c)));
  return len;
}
export const textLength = (el: HTMLElement) => nodeLength(el);

/** Смещение каретки в символах от начала поля; null — каретки в поле нет */
export function getCaret(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  const start = nodeLength(pre.cloneContents());
  pre.setEnd(r.endContainer, r.endOffset);
  return { start, end: nodeLength(pre.cloneContents()) };
}

/** Точка в DOM по смещению в символах */
function pointAt(el: HTMLElement, at: number): [Node, number] {
  let left = at;
  let found: [Node, number] | null = null;
  const walk = (n: Node): boolean => {
    if (n.nodeType === Node.TEXT_NODE) {
      const len = n.textContent?.length ?? 0;
      if (left <= len) { found = [n, left]; return true; }
      left -= len;
      return false;
    }
    if ((n as Element).tagName === "BR") {
      const parent = n.parentNode!;
      const idx = Array.prototype.indexOf.call(parent.childNodes, n);
      if (left === 0) { found = [parent, idx]; return true; }
      left -= 1;
      if (left === 0) { found = [parent, idx + 1]; return true; }
      return false;
    }
    for (const c of Array.from(n.childNodes)) if (walk(c)) return true;
    return false;
  };
  walk(el);
  return found ?? [el, el.childNodes.length];
}

/** Удалить символы [from, to) и вернуть очищенный HTML; каретка встаёт на from */
export function deleteChars(el: HTMLElement, from: number, to: number): string {
  const r = document.createRange();
  r.setStart(...pointAt(el, from));
  r.setEnd(...pointAt(el, to));
  r.deleteContents();
  const html = sanitize(el.innerHTML);
  el.innerHTML = html;
  if (document.activeElement === el) setCaret(el, from);
  return html;
}

/** Прямоугольник каретки — чтобы поставить меню «/» рядом */
export function caretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const rect = r.getClientRects()[0];
  if (rect) return rect;
  const n = r.startContainer;
  return n instanceof HTMLElement ? n.getBoundingClientRect() : n.parentElement?.getBoundingClientRect() ?? null;
}

/** Поставить каретку на смещение в символах (или в начало/конец) */
export function setCaret(el: HTMLElement, at: number | "start" | "end") {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (at === "end") { range.selectNodeContents(el); range.collapse(false); }
  else range.setStart(...pointAt(el, at === "start" ? 0 : at));
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Разрезать содержимое поля по каретке: [до, после] в HTML */
export function splitAtCaret(el: HTMLElement): [string, string] {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el.contains(sel.getRangeAt(0).startContainer)) return [el.innerHTML, ""];
  const r = sel.getRangeAt(0);
  if (!r.collapsed) r.deleteContents();
  const tail = document.createRange();
  tail.selectNodeContents(el);
  tail.setStart(r.startContainer, r.startOffset);
  const frag = tail.extractContents();
  const box = document.createElement("div");
  box.appendChild(frag);
  return [sanitize(el.innerHTML), sanitize(box.innerHTML)];
}

/** Каретка на первой / последней визуальной строке поля */
export function caretOnEdgeLine(el: HTMLElement, edge: "top" | "bottom"): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return true;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(edge === "top");
  const rects = r.getClientRects();
  const box = el.getBoundingClientRect();
  const rect = rects[0] ?? (r.startContainer instanceof HTMLElement ? r.startContainer.getBoundingClientRect() : null);
  if (!rect || (rect.top === 0 && rect.bottom === 0)) return true;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return edge === "top" ? rect.top - box.top < lh * 0.8 : box.bottom - rect.bottom < lh * 0.8;
}
