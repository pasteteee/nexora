import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../components/editor/elements/Markdown";

const render = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));
describe("notebook Markdown", () => {
  it("renders document structure while retaining inline formatting", () => {
    const html = render("# План\n**Важно** и *курсив*\n> Цитата\n- [x] Готово\n- Следующий шаг");
    expect(html).toContain("<h1>План</h1>");
    expect(html).toContain("<strong>Важно</strong>");
    expect(html).toContain("<em>курсив</em>");
    expect(html).toContain("<blockquote>Цитата</blockquote>");
    expect(html).toContain('aria-label="Выполнено"');
  });
  it("keeps HTML inert and code blocks literal", () => {
    const html = render("<script>alert(1)</script>\n```html\n<img src=x onerror=alert(1)>\n```");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<pre><code>&lt;img");
  });
});
