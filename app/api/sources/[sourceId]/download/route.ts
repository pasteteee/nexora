import { createSourceDownloadUrl, SourceAccessError } from "@/lib/storage/source-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer ([A-Za-z0-9._-]{1,8192})$/i)?.[1];
  if (!token) return Response.json({ error: "Требуется вход" }, { status: 401, headers });
  const { sourceId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId)) {
    return Response.json({ error: "Некорректный идентификатор источника" }, { status: 400, headers });
  }
  try {
    return Response.json(await createSourceDownloadUrl(token, sourceId), { headers });
  } catch (error) {
    if (error instanceof SourceAccessError) {
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    // Configuration errors and SDK diagnostics never reach ordinary clients.
    return Response.json({ error: "Не удалось получить файл" }, { status: 503, headers });
  }
}
