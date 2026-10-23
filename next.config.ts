import type { NextConfig } from "next";

// Refuse accidental publication of operational secrets at dev/build startup.
// NEXT_PUBLIC_ values are embedded in browser assets by Next.js.
const allowedPublicVariables = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
]);
for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith("NEXT_PUBLIC_") && (
    !allowedPublicVariables.has(name) || (value && /sb_secret_|service_role/i.test(value)) ||
    (name === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" && value &&
      (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(value) || value.includes("replace_me")))
  )) {
    throw new Error(`Недопустимая публичная переменная окружения: ${name}`);
  }
  if (name === "NEXT_PUBLIC_SUPABASE_URL" && value) {
    let valid = false;
    try {
      const url = new URL(value);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      valid = (url.protocol === "https:" || (local && url.protocol === "http:")) &&
        !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
    } catch { /* Report the variable name only. */ }
    if (!valid) throw new Error("Недопустимая переменная окружения: NEXT_PUBLIC_SUPABASE_URL");
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
