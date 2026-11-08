/** A4 в пунктах PDF. */
export const A4 = { width: 595.28, height: 841.89 };

export interface PdfImage { jpeg: Uint8Array; width: number; height: number }

/**
 * Минимальный PDF 1.4: по одной JPEG-картинке (DCTDecode) на страницу A4, вписанной по ширине.
 * Без внешних зависимостей; байты JPEG встраиваются как есть.
 */
export function imagesToPdf(images: PdfImage[], title = "Nexora"): Uint8Array {
  if (!images.length) throw new Error("PDF requires at least one page");
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => { const b = typeof part === "string" ? enc.encode(part) : part; chunks.push(b); length += b.length; };
  const object = (n: number, body: () => void) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };

  // Object numbering: 1 catalog, 2 pages, 3 info, then per page: page, content, image.
  const pageIds = images.map((_, i) => 4 + i * 3);
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${images.length} >>`));
  object(3, () => push(`<< /Title ${pdfString(title)} /Producer (Nexora) >>`));
  images.forEach((img, i) => {
    const pageId = pageIds[i], contentId = pageId + 1, imageId = pageId + 2;
    const w = A4.width, h = Math.min(A4.height, (img.height / img.width) * w);
    const draw = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 0 ${(A4.height - h).toFixed(2)} cm /Im0 Do Q`;
    object(pageId, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    object(contentId, () => { push(`<< /Length ${draw.length} >>\nstream\n`); push(draw); push("\nendstream"); });
    object(imageId, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`);
      push(img.jpeg); push("\nendstream");
    });
  });
  const total = 4 + images.length * 3;
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** UTF-16BE строка PDF с BOM — безопасна для кириллицы и скобок. */
function pdfString(text: string): string {
  let hex = "FEFF";
  for (const ch of text.slice(0, 200)) {
    const code = ch.codePointAt(0)!;
    const units = code > 0xffff ? [0xd800 + ((code - 0x10000) >> 10), 0xdc00 + ((code - 0x10000) & 0x3ff)] : [code];
    for (const u of units) hex += u.toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

/** Высота одного листа A4 в пикселях исходного изображения заданной ширины. */
export const pageSliceHeight = (widthPx: number) => Math.floor(widthPx * (A4.height / A4.width));
