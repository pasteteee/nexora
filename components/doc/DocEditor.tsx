"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Palette, Repeat2, Trash2 } from "lucide-react";
import { Menu, type MenuItem } from "@/components/ui";
import { useDoc } from "@/lib/doc/store";
import { KINDS, MAX_COLUMNS, TINTS, listNumber, locate, readingOrder, type Column, type Item, type Side } from "@/lib/doc/model";
import { Block } from "./Block";
import { KIND_META, TINT_LABEL } from "./kinds";
import { slashItems, useSlash } from "./slash";
import s from "./doc.module.css";

type Drop = { target: string | null; side: Side; box: { left: number; top: number; width: number; height: number } };

/** Документ из блоков: пишется сверху вниз, блоки перетаскиваются за ручку на полях */
export function DocEditor({ empty, showHandles }: { empty?: React.ReactNode; showHandles?: boolean }) {
  const items = useDoc((st) => st.items);
  const blocks = useDoc((st) => st.blocks);
  const canEdit = useDoc((st) => st.canEdit);
  const root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [dragging, setDragging] = useState<string[]>([]);

  // номера пунктов нумерованных списков по контейнерам
  const nums = useMemo(() => {
    const out: Record<string, number> = {};
    const containers: string[][] = [items.filter((i) => i.type === "block").map((i) => (i as { id: string }).id)];
    items.forEach((it) => it.type === "row" && it.cols.forEach((c) => containers.push(c.ids)));
    for (const ids of containers) for (const id of ids) if (blocks[id]?.kind === "numbered") out[id] = listNumber(blocks, ids, id);
    return out;
  }, [items, blocks]);

  /* ---------- меню блока ---------- */
  const openBlockMenu = useCallback((id: string, x: number, y: number) => {
    const st = useDoc.getState();
    const ids = st.selected.includes(id) ? st.selected : [id];
    st.select(ids);
    const kindsMenu = (): MenuItem[] => [
      { heading: "Превратить в" },
      ...KINDS.map((k): MenuItem => {
        const { Icon, label } = KIND_META[k];
        return { label, icon: <Icon size={16} />, onSelect: () => ids.forEach((b) => useDoc.getState().update(b, { kind: k })) };
      }),
    ];
    const tintMenu = (): MenuItem[] => [
      { heading: "Цвет" },
      { label: "Без цвета", icon: <span className={s.swatch} />, onSelect: () => ids.forEach((b) => useDoc.getState().update(b, { tint: null })) },
      ...TINTS.map((t): MenuItem => ({
        label: TINT_LABEL[t], icon: <span className={s.swatch} data-tint={t} />,
        onSelect: () => ids.forEach((b) => useDoc.getState().update(b, { tint: t })),
      })),
    ];
    setMenu({
      x, y,
      items: [
        { label: "Превратить в…", icon: <Repeat2 size={16} />, onSelect: () => setTimeout(() => setMenu({ x, y, items: kindsMenu() })) },
        { label: "Цвет…", icon: <Palette size={16} />, onSelect: () => setTimeout(() => setMenu({ x, y, items: tintMenu() })) },
        { sep: true },
        { label: "Дублировать", icon: <Copy size={16} />, kbd: "Ctrl+D", onSelect: () => useDoc.getState().duplicate(ids) },
        { label: "Выше", icon: <ArrowUp size={16} />, kbd: "Ctrl+Shift+↑", hidden: ids.length > 1, onSelect: () => useDoc.getState().moveBy(id, -1) },
        { label: "Ниже", icon: <ArrowDown size={16} />, kbd: "Ctrl+Shift+↓", hidden: ids.length > 1, onSelect: () => useDoc.getState().moveBy(id, 1) },
        { sep: true },
        { label: "Удалить", icon: <Trash2 size={16} />, kbd: "Del", danger: true, onSelect: () => useDoc.getState().remove(ids, true) },
      ],
    });
  }, []);

  /* ---------- перетаскивание за ручку ---------- */
  const onGrip = useCallback((e: React.PointerEvent, id: string) => {
    const st = useDoc.getState();
    const grip = e.currentTarget as HTMLElement;
    const gr = grip.getBoundingClientRect();
    if (!("pointerId" in e) || e.button !== 0) { openBlockMenu(id, gr.right + 4, gr.top); return; }
    if (!st.canEdit) return;
    e.preventDefault();
    const ids = st.selected.includes(id) ? readingOrder(st.items).filter((x) => st.selected.includes(x)) : [id];
    const start = { x: e.clientX, y: e.clientY };
    let ghost: HTMLElement | null = null;
    let target: Drop | null = null;
    let last = { x: e.clientX, y: e.clientY };
    let raf = 0;

    const begin = () => {
      const src = root.current!.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
      const r = src.getBoundingClientRect();
      ghost = src.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("data-block-id");
      ghost.querySelectorAll("[data-block-id]").forEach((n) => n.removeAttribute("data-block-id"));
      ghost.className += ` ${s.ghost}`;
      ghost.style.width = `${r.width}px`;
      if (ids.length > 1) ghost.dataset.count = String(ids.length);
      document.body.appendChild(ghost);
      document.body.classList.add(s.draggingBody);
      (document.activeElement as HTMLElement | null)?.blur?.();
      setDragging(ids);
    };

    const pick = (x: number, y: number): Drop | null => {
      const host = root.current!;
      const hostBox = host.getBoundingClientRect();
      const nodes = [...host.querySelectorAll<HTMLElement>("[data-block-id]")].filter((n) => !ids.some((d) => n.dataset.blockId === d || n.closest(`[data-block-id="${d}"]`)));
      if (!nodes.length) return { target: null, side: "after", box: { left: 0, top: 0, width: hostBox.width, height: 0 } };
      // ближайший блок к курсору
      let best = nodes[0], bestD = Infinity;
      for (const n of nodes) {
        const r = n.getBoundingClientRect();
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        const d = dy * 4 + dx;
        if (d < bestD) { bestD = d; best = n; }
      }
      const tid = best.dataset.blockId!;
      const body = best.querySelector<HTMLElement>(`.${s.body}`) ?? best;
      const r = body.getBoundingClientRect();
      const row = locate(useDoc.getState().items, tid)?.row;
      const canCol = !row || row.cols.length < MAX_COLUMNS;
      let side: Side = y < r.top + r.height / 2 ? "before" : "after";
      const inside = y >= r.top - 4 && y <= r.bottom + 4;
      if (canCol && inside && r.width > 180) {
        if (x > r.left + 6 && x < r.left + 44) side = "left";
        else if (x > r.right - 64) side = "right";
      }
      const rel = { left: r.left - hostBox.left, top: r.top - hostBox.top, width: r.width, height: r.height };
      const box =
        side === "before" ? { ...rel, top: rel.top - 3, height: 0 }
        : side === "after" ? { ...rel, top: rel.top + rel.height + 3, height: 0 }
        : side === "left" ? { ...rel, left: rel.left - 10, width: 0 }
        : { ...rel, left: rel.left + rel.width + 8, width: 0 };
      return { target: tid, side, box };
    };

    const tick = () => {
      // автопрокрутка у краёв окна
      const edge = 72;
      const v = last.y < edge ? -(edge - last.y) : last.y > innerHeight - edge ? last.y - (innerHeight - edge) : 0;
      if (v) { window.scrollBy(0, v * 0.35); target = pick(last.x, last.y); setDrop(target); }
      raf = requestAnimationFrame(tick);
    };

    const move = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      if (!ghost) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
        begin();
        raf = requestAnimationFrame(tick);
      }
      ghost!.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
      target = pick(ev.clientX, ev.clientY);
      setDrop(target);
    };
    const finish = (ok: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", esc, true);
      cancelAnimationFrame(raf);
      document.body.classList.remove(s.draggingBody);
      const wasDrag = !!ghost;
      ghost?.remove();
      ghost = null;
      setDrop(null);
      setDragging([]);
      if (!wasDrag) { openBlockMenu(id, gr.right + 4, gr.top); return; }
      if (ok && target) {
        useDoc.getState().move(ids, target.target, target.side);
        useDoc.getState().select(ids);
      }
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); finish(false); } };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", esc, true);
  }, [openBlockMenu]);

  const onAdd = useCallback((id: string) => {
    const st = useDoc.getState();
    const b = st.blocks[id];
    // пустой абзац не плодим — сразу открываем меню в нём
    const target = b && b.kind === "p" && !b.text ? id : st.insertAfter(id);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-block-id="${target}"] [data-editable]`);
      if (!el) return;
      st.focusBlock(target, "start");
      requestAnimationFrame(() => {
        document.execCommand("insertText", false, "/");
      });
    });
  }, []);

  /* ---------- клавиши для выделенных блоков ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useDoc.getState();
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && (k === "z" || k === "я")) { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && (k === "y" || k === "н")) { e.preventDefault(); st.redo(); return; }
      const sel = st.selected;
      if (!sel.length || !st.canEdit) return;
      const order = readingOrder(st.items);
      if (e.key === "Escape") { st.select([]); return; }
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); st.remove(sel, true); return; }
      if (e.key === "Enter") { e.preventDefault(); const b = st.blocks[sel[0]]; if (b?.kind !== "divider") st.focusBlock(sel[0], "end"); return; }
      if (mod && (k === "d" || k === "в")) { e.preventDefault(); st.duplicate(sel); return; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? -1 : 1;
        if (mod && e.shiftKey && sel.length === 1) { st.moveBy(sel[0], dir); return; }
        const i = order.indexOf(dir < 0 ? sel[0] : sel.at(-1)!);
        const next = order[i + dir];
        if (next) st.select(e.shiftKey ? [...new Set([...sel, next])] : [next]);
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(`.${s.handles}`) && !t.closest("[role=menu]") && !t.closest(`.${s.divider}`)) {
        if (useDoc.getState().selected.length) useDoc.getState().select([]);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown, true); };
  }, []);

  /** Клик под последним блоком — продолжить писать */
  function onTail() {
    const st = useDoc.getState();
    if (!st.canEdit) return;
    const last = st.items.at(-1);
    const b = last?.type === "block" ? st.blocks[last.id] : null;
    if (b && b.kind === "p" && !b.text) st.focusBlock(b.id, "end");
    else st.insertAfter(null);
  }

  const renderBlock = (id: string) => (
    <Block key={id} id={id} num={nums[id] ?? 0} onGrip={onGrip} onAdd={onAdd} />
  );

  return (
    <div ref={root} className={s.doc} data-dragging={dragging.length ? "" : undefined} data-show-handles={showHandles ? "" : undefined}>
      {items.length === 0 && empty}
      {items.map((it) =>
        it.type === "block" ? (
          <div key={it.id} className={dragging.includes(it.id) ? s.lifted : undefined}>{renderBlock(it.id)}</div>
        ) : (
          <Row key={it.id} item={it} canEdit={canEdit} dragging={dragging} renderBlock={renderBlock} />
        ),
      )}
      {canEdit && <div className={s.tail} onClick={onTail} aria-hidden />}
      {drop && (
        <div
          className={s.drop}
          data-vertical={drop.side === "left" || drop.side === "right" ? "" : undefined}
          style={{ left: drop.box.left, top: drop.box.top, width: drop.box.width || undefined, height: drop.box.height || undefined }}
        />
      )}
      <SlashMenu />
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

/* ---------- ряд колонок с изменением ширины ---------- */

function Row({ item, canEdit, dragging, renderBlock }: {
  item: Extract<Item, { type: "row" }>;
  canEdit: boolean;
  dragging: string[];
  renderBlock: (id: string) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<number[] | null>(null);
  const widths = live ?? item.cols.map((c: Column) => c.w);

  function onResize(e: React.PointerEvent, i: number) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const total = widths.reduce((a, b) => a + b, 0);
    const rowW = ref.current!.getBoundingClientRect().width;
    const base = [...widths];
    const min = total * 0.12;
    let cur = base;
    const move = (ev: PointerEvent) => {
      const dw = ((ev.clientX - e.clientX) / rowW) * total;
      const a = Math.max(min, Math.min(base[i] + base[i + 1] - min, base[i] + dw));
      cur = base.map((w, j) => (j === i ? a : j === i + 1 ? base[i] + base[i + 1] - a : w));
      setLive(cur);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setLive(null);
      if (cur !== base) useDoc.getState().setColumnWidths(item.id, cur.map((w) => Math.round(w * 1000) / 1000));
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  return (
    <div ref={ref} className={s.row}>
      {item.cols.map((c, i) => (
        <Fragment key={i}>
          <div className={s.col} style={{ flexGrow: widths[i] }}>
            {c.ids.map((id) => <div key={id} className={dragging.includes(id) ? s.lifted : undefined}>{renderBlock(id)}</div>)}
          </div>
          {i < item.cols.length - 1 && (
            canEdit
              ? <div className={s.resizer} role="separator" aria-orientation="vertical" aria-label="Ширина колонок" onPointerDown={(e) => onResize(e, i)} />
              : <div className={s.gutter} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

/* ---------- меню «/» ---------- */

function SlashMenu() {
  const { open, x, y, query, index } = useSlash();
  const ref = useRef<HTMLDivElement>(null);
  const list = slashItems(query);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    if (!open) return;
    const r = ref.current?.getBoundingClientRect();
    const h = r?.height ?? 320;
    setPos({ x: Math.min(x, innerWidth - 268), y: y + h > innerHeight - 8 ? Math.max(8, y - h - 30) : y });
  }, [open, x, y, list.length]);
  useEffect(() => { ref.current?.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest" }); }, [index]);

  if (!open || !list.length) return null;
  return (
    <div ref={ref} className={s.slash} style={{ left: pos.x, top: pos.y }} role="listbox" aria-label="Тип блока" onMouseDown={(e) => e.preventDefault()}>
      <div className={s.slashHead}>{query ? `«${query}»` : "Блоки"}</div>
      {list.map((k, i) => {
        const { Icon, label, hint, md } = KIND_META[k];
        return (
          <button
            key={k}
            type="button"
            data-i={i}
            role="option"
            aria-selected={i === index}
            className={s.slashItem}
            onMouseEnter={() => useSlash.getState().setIndex(i)}
            onClick={() => useSlash.getState().choose(k)}
          >
            <span className={s.slashIcon}><Icon size={18} strokeWidth={1.75} /></span>
            <span className={s.slashText}><b>{label}</b><small>{hint}</small></span>
            {md && <kbd>{md}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
