/** Серверная конфигурация лимитов (ТЗ п. 4.2.6, 4.2.7, 4.2.8). */
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const limits = {
  maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 25) * 1024 * 1024,
  workspaceMaxSources: num(process.env.WORKSPACE_MAX_SOURCES, 100),
  workspaceMaxBytes: num(process.env.WORKSPACE_MAX_MB, 500) * 1024 * 1024,
  aiRequestsPerHour: num(process.env.AI_REQUESTS_PER_HOUR, 30),
  searchMinSimilarity: num(process.env.SEARCH_MIN_SIMILARITY, 0.3),
};

/** Ключи Supabase заданы и это не заглушка из .env.example — иначе демо-режим */
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && /^sb_publishable_/.test(key) && !key.includes("replace_me"));
