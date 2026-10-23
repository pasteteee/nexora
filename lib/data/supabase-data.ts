"use client";
/** Реализация DataApi поверх Supabase (Postgres + RLS). Права проверяет база, клиент только отображает. */
import type { DataApi } from "./api";
import { ApiError } from "./api";
import type { Canvas, CanvasElement, Role, WorkspaceCard } from "@/lib/types";
import { TRASH_DAYS } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { imageSize, safeName, validateImage } from "./images";

type Row = Record<string, unknown>;
const sb = () => supabaseBrowser();

function check<T>(r: { data: T; error: { message: string; code?: string } | null }): T {
  if (r.error) {
    if (r.error.code === "PGRST116") throw new ApiError("Не найдено", "not_found");
    if (r.error.code === "42501") throw new ApiError("Недостаточно прав", "forbidden");
    throw new ApiError(r.error.message, "network");
  }
  return r.data;
}
async function uid() {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new ApiError("Войдите в систему", "auth");
  return data.user.id;
}

const toWs = (r: Row, role: Role, pageCount: number): WorkspaceCard => ({
  id: r.id as string, ownerId: r.owner_id as string, name: r.name as string,
  createdAt: r.created_at as string, updatedAt: r.updated_at as string, deletedAt: (r.deleted_at as string) ?? null,
  role, pageCount,
});

async function pageCounts(ids: string[]) {
  const counts = new Map<string, number>();
  if (!ids.length) return counts;
  const rows = check(await sb().from("canvases").select("workspace_id").in("workspace_id", ids).is("deleted_at", null));
  for (const r of rows ?? []) counts.set(r.workspace_id, (counts.get(r.workspace_id) ?? 0) + 1);
  return counts;
}

const toCanvas = (r: Row): Canvas => ({
  id: r.id as string, workspaceId: r.workspace_id as string, name: r.name as string,
  backgroundType: r.background_type as Canvas["backgroundType"], backgroundSpacing: r.background_spacing as Canvas["backgroundSpacing"],
  position: r.position as number, deletedAt: (r.deleted_at as string) ?? null,
  createdAt: r.created_at as string, updatedAt: r.updated_at as string,
});
const CANVAS_COLS = { name: "name", backgroundType: "background_type", backgroundSpacing: "background_spacing", position: "position" } as const;

const toEl = (r: Row): CanvasElement => ({
  id: r.id as string, canvasId: r.canvas_id as string, type: r.type as CanvasElement["type"],
  x: r.x as number, y: r.y as number, width: r.width as number, height: r.height as number,
  rotation: r.rotation as number, zIndex: r.z_index as number,
  content: (r.content_json as Row) ?? {}, style: (r.style_json as Row) ?? {},
  sourceId: (r.source_id as string) ?? null, groupId: (r.group_id as string) ?? null,
  createdBy: (r.created_by as string) ?? null, updatedAt: r.updated_at as string,
});
/** Поля, которые клиент может менять у существующего объекта (grant update в схеме) */
const elUpdate = (e: CanvasElement) => ({
  type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, rotation: 0, z_index: e.zIndex,
  content_json: e.content, style_json: e.style, source_id: e.sourceId, group_id: e.groupId,
});

async function nextPosition(workspaceId: string) {
  const r = check(await sb().from("canvases").select("position").eq("workspace_id", workspaceId)
    .is("deleted_at", null).order("position", { ascending: false }).limit(1));
  return ((r?.[0]?.position as number) ?? 0) + 1;
}

const IMAGES = "nexora-images";
const signed = new Map<string, { url: string; until: number }>();

const notYet = (what: string) => async (): Promise<never> => {
  throw new ApiError(`${what}: будет подключено в следующем спринте`, "network");
};

export const supabaseData: DataApi = {
  async listWorkspaces() {
    const me = await uid();
    const rows = check(await sb().from("workspace_members").select("role, workspaces!inner(*)")
      .eq("user_id", me).is("workspaces.deleted_at", null)) as unknown as { role: Role; workspaces: Row }[];
    const counts = await pageCounts(rows.map((r) => r.workspaces.id as string));
    return rows.map((r) => toWs(r.workspaces, r.role, counts.get(r.workspaces.id as string) ?? 0))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async listTrash() {
    const me = await uid();
    const edge = new Date(Date.now() - TRASH_DAYS * 864e5).toISOString();
    const rows = check(await sb().from("workspaces").select("*").eq("owner_id", me)
      .not("deleted_at", "is", null).gt("deleted_at", edge));
    return (rows ?? []).map((r) => toWs(r, "owner", 0));
  },
  async getWorkspace(id) {
    const me = await uid();
    const r = await sb().from("workspace_members").select("role, workspaces!inner(*)")
      .eq("user_id", me).eq("workspace_id", id).is("workspaces.deleted_at", null).maybeSingle();
    if (r.error || !r.data) return null;
    const row = r.data as unknown as { role: Role; workspaces: Row };
    const counts = await pageCounts([id]);
    return toWs(row.workspaces, row.role, counts.get(id) ?? 0);
  },
  async createWorkspace(name) {
    const me = await uid();
    // владельца-участника добавляет триггер bootstrap_workspace_owner
    const ws = check(await sb().from("workspaces")
      .insert({ owner_id: me, name: name?.trim() || "Новая тетрадь" }).select().single());
    // у новой тетради сразу есть первая страница
    check(await sb().from("canvases").insert({ workspace_id: ws.id, name: "Страница 1", position: 1 }));
    return toWs(ws, "owner", 1);
  },
  async renameWorkspace(id, name) {
    check(await sb().from("workspaces").update({ name: name.trim() }).eq("id", id));
  },
  async trashWorkspace(id) {
    // удаление и восстановление — только атомарные RPC (публикации отключаются в той же транзакции)
    check(await sb().rpc("soft_delete_workspace", { p_workspace_id: id }));
  },
  async restoreWorkspace(id) {
    check(await sb().rpc("restore_workspace", { p_workspace_id: id }));
  },

  async listCanvases(workspaceId) {
    const r = check(await sb().from("canvases").select("*").eq("workspace_id", workspaceId).is("deleted_at", null).order("position"));
    return (r ?? []).map(toCanvas);
  },
  async listCanvasTrash(workspaceId) {
    const r = check(await sb().from("canvases").select("*").eq("workspace_id", workspaceId).not("deleted_at", "is", null));
    return (r ?? []).map(toCanvas);
  },
  async getCanvas(id) {
    const r = await sb().from("canvases").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
    return r.data ? toCanvas(r.data) : null;
  },
  async createCanvas(workspaceId, name) {
    const count = (await this.listCanvases(workspaceId)).length;
    const r = check(await sb().from("canvases").insert({
      workspace_id: workspaceId, name: name?.trim() || `Страница ${count + 1}`, position: await nextPosition(workspaceId),
    }).select().single());
    return toCanvas(r);
  },
  async updateCanvas(id, patch) {
    const row: Row = {};
    for (const [k, col] of Object.entries(CANVAS_COLS)) if (k in patch) row[col] = patch[k as keyof typeof patch];
    check(await sb().from("canvases").update(row).eq("id", id));
  },
  async duplicateCanvas(id) {
    // копирование целиком в одной транзакции — функция duplicate_canvas в БД
    const newId = check(await sb().rpc("duplicate_canvas", { p_canvas_id: id })) as string;
    return toCanvas(check(await sb().from("canvases").select("*").eq("id", newId).single()) as Row);
  },
  async trashCanvas(id) {
    check(await sb().from("canvases").update({ deleted_at: new Date().toISOString() }).eq("id", id));
  },
  async restoreCanvas(id) {
    check(await sb().from("canvases").update({ deleted_at: null }).eq("id", id));
  },
  async reorderCanvases(_workspaceId, orderedIds) {
    await Promise.all(orderedIds.map((cid, i) => sb().from("canvases").update({ position: i + 1 }).eq("id", cid).then(check)));
  },
  async listElements(canvasId) {
    const r = check(await sb().from("elements").select("*").eq("canvas_id", canvasId).order("z_index"));
    return (r ?? []).map(toEl);
  },
  async upsertElements(els) {
    if (!els.length) return;
    // id, холст и тетрадь задаются только при вставке, created_by — по умолчанию auth.uid()
    const ids = els.map((e) => e.id);
    const existing = new Set((check(await sb().from("elements").select("id").in("id", ids)) ?? []).map((r) => r.id as string));
    const fresh = els.filter((e) => !existing.has(e.id));
    if (fresh.length) {
      const canvasIds = [...new Set(fresh.map((e) => e.canvasId))];
      const ws = new Map((check(await sb().from("canvases").select("id, workspace_id").in("id", canvasIds)) ?? [])
        .map((r) => [r.id as string, r.workspace_id as string]));
      // группа должна существовать раньше своих объектов
      const ordered = [...fresh].sort((a, b) => Number(b.type === "group") - Number(a.type === "group"));
      check(await sb().from("elements").insert(ordered.map((e) => ({
        id: e.id, canvas_id: e.canvasId, workspace_id: ws.get(e.canvasId), ...elUpdate(e),
      }))));
    }
    await Promise.all(els.filter((e) => existing.has(e.id))
      .map((e) => sb().from("elements").update(elUpdate(e)).eq("id", e.id).then(check)));
  },
  async deleteElements(ids) {
    if (!ids.length) return;
    check(await sb().from("elements").delete().in("id", ids));
  },
  async uploadImage(workspaceId, file) {
    validateImage(file);
    const { width, height } = await imageSize(file);
    // оригинал без изменений; путь начинается с тетради — по нему проверяют политики бакета
    const path = `${workspaceId}/${crypto.randomUUID()}/${safeName(file.name)}`;
    const r = await sb().storage.from(IMAGES).upload(path, file, { contentType: file.type, upsert: false });
    if (r.error) throw new ApiError("Не удалось загрузить изображение", "network");
    return { name: file.name, mime: file.type, naturalWidth: width, naturalHeight: height, path };
  },
  async imageUrl(path) {
    const hit = signed.get(path);
    if (hit && hit.until > Date.now()) return hit.url;
    const r = await sb().storage.from(IMAGES).createSignedUrl(path, 3600);
    if (r.error || !r.data) throw new ApiError("Изображение недоступно", "not_found");
    signed.set(path, { url: r.data.signedUrl, until: Date.now() + 50 * 60_000 });
    return r.data.signedUrl;
  },
  listSources: notYet("Источники"),
  uploadSource: notYet("Источники"),
  deleteSource: notYet("Источники"),
};
