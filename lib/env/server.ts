import "server-only";

import { ConfigurationError, httpOrigin, required, signedUrlTtl } from "./validation";

export function getServerEnv() {
  return {
    appUrl: httpOrigin(process.env.APP_URL ?? "http://localhost:3000", "APP_URL"),
    sourceSignedUrlTtlSeconds: signedUrlTtl(process.env.SOURCE_SIGNED_URL_TTL_SECONDS),
  };
}

// Lazy access: regular Auth/Storage requests do not require a privileged key.
// Call only from a server worker after its authorization checks.
export function getSupabaseSecretKey(): string {
  const key = required(process.env.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY");
  if (!/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new ConfigurationError("SUPABASE_SECRET_KEY");
  }
  return key;
}
