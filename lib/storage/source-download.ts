import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "../env/public";
import { getServerEnv } from "../env/server";
import type { Database } from "../supabase/database.types";
import { issueSourceDownload } from "./download-policy";
export { SourceAccessError } from "./download-policy";

export async function createSourceDownloadUrl(accessToken: string, sourceId: string) {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();
  const { sourceSignedUrlTtlSeconds } = getServerEnv();
  // Always use the requesting user's JWT and the public key, never service_role.
  const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return issueSourceDownload(supabase, accessToken, sourceId, sourceSignedUrlTtlSeconds);
}
