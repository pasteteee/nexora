"use client";
/** Реализация DataApi поверх Supabase (Postgres + RLS). Права проверяет база, клиент только отображает. */
import type { DataApi } from "./api";
import { ApiError } from "./api";
import type { Canvas, Role, WorkspaceCard } from "@/lib/types";
import { TRASH_DAYS } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";

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

async function nextPosition(workspaceId: string) {
  const r = check(await sb().from("canvases").select("position").eq("workspace_id", workspaceId)
    .is("deleted_at", null).order("position", { ascending: false }).limit(1));
  return ((r?.[0]?.position as number) ?? 0) + 1;
}

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
    check(await sb().from("workspaces").update({ deleted_at: new Date().toISOString() }).eq("id", id));
  },
  async restoreWorkspace(id) {
    check(await sb().from("workspaces").update({ deleted_at: null }).eq("id", id));
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
    const newId = check(await sb().rpc("duplicate_canvas", { src: id })) as string;
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
  listElements: notYet("Элементы"),
  upsertElements: notYet("Элементы"),
  deleteElements: notYet("Элементы"),
  listSources: notYet("Источники"),
  uploadSource: notYet("Источники"),
  deleteSource: notYet("Источники"),
};
