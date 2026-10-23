export type Environment = Record<string, string | undefined>;

export class ConfigurationError extends Error {
  constructor(variable: string) {
    // Values are deliberately excluded from errors and HTTP responses.
    super(`Проверьте переменную окружения ${variable}`);
    this.name = "ConfigurationError";
  }
}

export function required(value: string | undefined, variable: string): string {
  if (!value?.trim() || /replace_me|your[-_]|<[^>]+>/i.test(value)) {
    throw new ConfigurationError(variable);
  }
  return value.trim();
}

export function httpOrigin(value: string | undefined, variable: string): string {
  const raw = required(value, variable);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigurationError(variable);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/"
  ) {
    throw new ConfigurationError(variable);
  }
  return url.origin;
}

export function publishableKey(value: string | undefined): string {
  const variable = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
  const key = required(value, variable);
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new ConfigurationError(variable);
  }
  return key;
}

export function signedUrlTtl(value: string | undefined): number {
  const raw = value ?? "60";
  if (!/^\d+$/.test(raw)) throw new ConfigurationError("SOURCE_SIGNED_URL_TTL_SECONDS");
  const ttl = Number(raw);
  if (ttl < 1 || ttl > 300) throw new ConfigurationError("SOURCE_SIGNED_URL_TTL_SECONDS");
  return ttl;
}

// Non-secret system values injected by Vercel (environment, URLs, git ref).
export function isVercelSystemVariable(name: string): boolean {
  return name.startsWith("NEXT_PUBLIC_VERCEL_") && !/SECRET|TOKEN|BYPASS|KEY|PASS/.test(name);
}

export function assertPublicEnvironment(env: Environment): void {
  // Explicit allowlist: no SMTP, worker credentials or management tokens can
  // become browser-visible by accidentally adding a NEXT_PUBLIC_ prefix.
  const allowed = new Set([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ]);
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    if (!allowed.has(name) && !isVercelSystemVariable(name)) throw new ConfigurationError(name);
    if (value && /sb_secret_|service_role/i.test(value)) throw new ConfigurationError(name);
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    httpOrigin(env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  }
  if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    publishableKey(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  }
}
