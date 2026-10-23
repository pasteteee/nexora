import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public";

export async function supabaseServer() {
  const store = await cookies();
  const env = getPublicEnv();
  return createServerClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // вызов из Server Component — куки обновит middleware
          }
        },
      },
    },
  );
}
