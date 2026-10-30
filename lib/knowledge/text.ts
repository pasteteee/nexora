export type TextPage = { text: string; ref: string | null };
/** A privileged worker must never normalize a caller-controlled object path. */
export function assertSourcePath(
  path: string,
  workspaceId: string,
  sourceId: string,
) {
  const prefix = `${workspaceId}/${sourceId}/`;
  if (!path.startsWith(prefix)) throw new Error("Недопустимый путь материала");
  const filename = path.slice(prefix.length);
  if (
    !/^[A-Za-z0-9_.-]{1,120}$/.test(filename) ||
    filename === "." ||
    filename === ".."
  )
    throw new Error("Недопустимый путь материала");
}
export function chunks(pages: TextPage[], size = 1000, overlap = 150) {
  if (size <= overlap || overlap < 0) throw new Error("Invalid chunk size");
  return pages.flatMap(({ text, ref }) => {
    const normalized = text
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
    const result: { content: string; page_ref: string | null }[] = [];
    for (let start = 0; start < normalized.length; start += size - overlap) {
      const content = normalized.slice(start, start + size).trim();
      if (content) result.push({ content, page_ref: ref });
      if (start + size >= normalized.length) break;
    }
    return result;
  });
}
export function assertFile(
  bytes: Uint8Array,
  mime: string,
  expectedSize: number,
  max: number,
) {
  if (
    ![
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/png",
      "image/jpeg",
      "text/plain",
      "text/markdown",
    ].includes(mime)
  )
    throw new Error("Неподдерживаемый формат");
  if (bytes.length !== expectedSize || bytes.length > max || !bytes.length)
    throw new Error("Недопустимый размер файла");
  const header = new TextDecoder().decode(bytes.slice(0, 8));
  if (mime === "application/pdf" && !header.startsWith("%PDF-"))
    throw new Error("Файл не является PDF");
  if (mime.includes("presentationml") && !(bytes[0] === 80 && bytes[1] === 75))
    throw new Error("Файл не является PPTX");
  if (
    mime === "image/png" &&
    !(bytes[0] === 137 && header.slice(1, 4) === "PNG")
  )
    throw new Error("Файл не является PNG");
  if (
    mime === "image/jpeg" &&
    !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
  )
    throw new Error("Файл не является JPEG");
  if (mime.startsWith("text/") && bytes.includes(0))
    throw new Error("Недопустимый текстовый файл");
}
