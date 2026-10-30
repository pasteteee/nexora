import "server-only";
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { TextPage } from "./text";

export async function extract(
  bytes: Uint8Array,
  mime: string,
): Promise<TextPage[]> {
  if (mime.startsWith("text/"))
    return [
      {
        text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        ref: null,
      },
    ];
  if (mime.startsWith("image/")) return [];
  if (mime === "application/pdf") {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: bytes, useSystemFonts: true });
    const pdf = await task.promise;
    try {
      if (pdf.numPages > 500) throw new Error("Слишком много страниц");
      const pages: TextPage[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        pages.push({
          text: content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
          ref: `Страница ${n}`,
        });
      }
      return pages;
    } finally {
      await task.destroy();
    }
  }
  if (mime.includes("presentationml")) {
    let total = 0;
    const zip = unzipSync(bytes, {
      filter(file) {
        if (!/^ppt\/slides\/slide\d+\.xml$/.test(file.name)) return false;
        total += file.originalSize;
        if (total > 20 * 1024 * 1024)
          throw new Error("Слишком большой распакованный документ");
        return true;
      },
    });
    const parser = new XMLParser({
      ignoreAttributes: true,
      processEntities: false,
    });
    function texts(node: unknown): string[] {
      if (Array.isArray(node)) return node.flatMap(texts);
      if (!node || typeof node !== "object") return [];
      return Object.entries(node).flatMap(([key, value]) =>
        key === "a:t"
          ? Array.isArray(value)
            ? value.map(String)
            : [String(value)]
          : texts(value),
      );
    }
    return Object.keys(zip)
      .sort(
        (a, b) =>
          Number(a.match(/slide(\d+)/)?.[1]) -
          Number(b.match(/slide(\d+)/)?.[1]),
      )
      .map((name) => ({
        text: texts(parser.parse(new TextDecoder().decode(zip[name]))).join(
          "\n",
        ),
        ref: `Слайд ${name.match(/slide(\d+)/)?.[1]}`,
      }));
  }
  throw new Error("Неподдерживаемый формат");
}
