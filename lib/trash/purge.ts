import { TRASH_DAYS } from "@/lib/types";

/**
 * Final deletion of trash older than TRASH_DAYS (ТЗ: «корзина хранит 30 дней»).
 * RLS already hides expired rows; this job removes them and their Storage files.
 *
 * Works with any client that has the service role (secret key): it bypasses RLS.
 */
export const IMAGES_BUCKET = "nexora-images";
export const SOURCES_BUCKET = "nexora-sources";

type Result<T> = { data: T | null; error: { message: string } | null };
type Query = PromiseLike<Result<Record<string, unknown>[]>> & {
  select(cols: string): Query; lt(col: string, v: string): Query; in(col: string, v: string[]): Query;
  not(col: string, op: string, v: unknown): Query; is(col: string, v: null): Query; eq(col: string, v: string): Query;
  delete(): Query;
};
export type PurgeClient = {
  from(table: string): Query;
  storage: { from(bucket: string): {
    list(prefix: string, opts?: { limit?: number; offset?: number }): Promise<Result<{ name: string; id: string | null }[]>>;
    remove(paths: string[]): Promise<Result<unknown>>;
  } };
};
export type PurgeReport = { workspaces: number; pages: number; files: number };

const BATCH = 100;

async function rows(q: Query) {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.data ?? [];
}

/** Every object below `<prefix>/` (two levels: <workspace>/<uuid>/<file>). */
async function listTree(sb: PurgeClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number) => {
    for (let offset = 0; ; offset += 1000) {
      const r = await sb.storage.from(bucket).list(dir, { limit: 1000, offset });
      if (r.error) throw new Error(r.error.message);
      const items = r.data ?? [];
      for (const it of items) {
        const path = `${dir}/${it.name}`;
        if (it.id === null && depth < 3) await walk(path, depth + 1); // folder
        else out.push(path);
      }
      if (items.length < 1000) break;
    }
  };
  await walk(prefix, 1);
  return out;
}

async function removeFiles(sb: PurgeClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += BATCH) {
    const r = await sb.storage.from(bucket).remove(paths.slice(i, i + BATCH));
    if (r.error) throw new Error(r.error.message);
  }
  return paths.length;
}

export async function purgeExpiredTrash(sb: PurgeClient, now = new Date()): Promise<PurgeReport> {
  const edge = new Date(now.getTime() - TRASH_DAYS * 864e5).toISOString();
  const report: PurgeReport = { workspaces: 0, pages: 0, files: 0 };

  // 1. Notebooks: files first, then the row (members, pages, blocks, sources cascade).
  const workspaces = await rows(sb.from("workspaces").select("id").not("deleted_at", "is", null).lt("deleted_at", edge));
  for (const { id } of workspaces as { id: string }[]) {
    for (const bucket of [SOURCES_BUCKET, IMAGES_BUCKET]) report.files += await removeFiles(sb, bucket, await listTree(sb, bucket, id));
    await rows(sb.from("workspaces").delete().eq("id", id));
    report.workspaces++;
  }

  // 2. Pages in live notebooks. An image file may be shared by a duplicated page,
  //    so it is removed only when no surviving block still points at it.
  const pages = (await rows(sb.from("canvases").select("id,workspace_id").not("deleted_at", "is", null).lt("deleted_at", edge))) as { id: string; workspace_id: string }[];
  for (const page of pages) {
    const images = (await rows(sb.from("elements").select("content_json").eq("canvas_id", page.id).eq("type", "image")))
      .map((e) => (e.content_json as { path?: unknown } | null)?.path)
      .filter((p): p is string => typeof p === "string" && p.startsWith(`${page.workspace_id}/`));
    await rows(sb.from("canvases").delete().eq("id", page.id));
    report.pages++;
    if (!images.length) continue;
    const still = new Set((await rows(sb.from("elements").select("content_json").eq("workspace_id", page.workspace_id).eq("type", "image")))
      .map((e) => (e.content_json as { path?: unknown } | null)?.path));
    report.files += await removeFiles(sb, IMAGES_BUCKET, [...new Set(images)].filter((p) => !still.has(p)));
  }
  return report;
}
