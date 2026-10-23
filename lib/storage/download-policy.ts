import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

export class SourceAccessError extends Error {
  readonly status: 401 | 404;
  constructor(status: 401 | 404) {
    super(status === 401 ? "Требуется вход" : "Источник недоступен");
    this.status = status;
    this.name = "SourceAccessError";
  }
}

export async function issueSourceDownload(
  supabase: Pick<SupabaseClient<Database>, "auth" | "from" | "storage">,
  accessToken: string,
  sourceId: string,
  expiresIn: number,
) {
  const { data: auth, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !auth.user) throw new SourceAccessError(401);

  const { data: source, error: sourceError } = await supabase
    .from("sources").select("file_path").eq("id", sourceId).maybeSingle();
  // RLS checks workspace membership, role and soft-deleted state.
  if (sourceError || !source) throw new SourceAccessError(404);

  const { data, error } = await supabase.storage.from("nexora-sources")
    .createSignedUrl(source.file_path, expiresIn, { download: true });
  if (error || !data) throw new SourceAccessError(404);
  return { signedUrl: data.signedUrl, expiresIn };
}
