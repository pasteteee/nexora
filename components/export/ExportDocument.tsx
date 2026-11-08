import { useMemo, type CSSProperties } from "react";
import katex from "katex";
import { Markdown } from "@/components/editor/elements/Markdown";
import { fillOf, strokeOf, textCss } from "@/lib/editor/styles";
import type { CanvasElement } from "@/lib/types";
import s from "./export.module.css";

const textOf = (el: CanvasElement) => String(el.content.text ?? "");

function FormulaBlock({ el }: { el: CanvasElement }) {
  const latex = String(el.content.latex ?? "");
  const html = useMemo(() => {
    try { return katex.renderToString(latex || "\\square", { throwOnError: true, displayMode: true }); } catch { return null; }
  }, [latex]);
  const size = Number(el.style.fontSize ?? 20);
  return html ? <div className={s.formula} style={{ fontSize: size }} dangerouslySetInnerHTML={{ __html: html }} />
    : <pre className={s.formulaError}>{latex}</pre>;
}

/**
 * Static, editor-independent rendering of a page used for PNG/PDF export.
 * `images` maps element id → already resolved (data) URL, so the snapshot never waits on the network.
 */
export function ExportDocument({ title, blocks, images }: { title?: string; blocks: CanvasElement[]; images: Record<string, string> }) {
  return <article className={s.doc}>
    {title && <h1 className={s.title}>{title}</h1>}
    {blocks.map((el) => {
      const style = textCss(el.style) as CSSProperties;
      let body;
      if (el.type === "text" || el.type === "diagram_node") body = <div className={s.text} style={{ ...style, fontSize: style.fontSize ?? 16 }}><Markdown text={textOf(el)} /></div>;
      else if (el.type === "note") body = <div className={s.note} style={{ ...style, background: fillOf(el.style.fill) }}><Markdown text={textOf(el)} /></div>;
      else if (el.type === "shape") body = <div className={s.shape} data-shape={String(el.content.kind ?? "rect")} style={{ ...style, background: fillOf(el.style.fill), borderColor: strokeOf(el.style.stroke) }}><Markdown text={textOf(el)} /></div>;
      else if (el.type === "formula") body = <FormulaBlock el={el} />;
      else if (el.type === "image") body = images[el.id]
        // eslint-disable-next-line @next/next/no-img-element -- offscreen snapshot of private images
        ? <img className={s.image} src={images[el.id]} alt={String(el.content.name ?? "")} />
        : <div className={s.missing}>Изображение недоступно</div>;
      else if (el.type === "source" || el.type === "source_fragment") {
        const c = el.content as { name?: string; text?: string; pageRef?: string; page?: number };
        body = <div className={s.source}>
          {el.type === "source_fragment" && <p>{c.text}</p>}
          <span>{c.name}{c.pageRef ? ` · ${c.pageRef}` : c.page ? ` · с. ${c.page}` : ""}</span>
        </div>;
      } else return null;
      return <section key={el.id} className={s.block}>{body}</section>;
    })}
  </article>;
}
