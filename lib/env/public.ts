import { httpOrigin, publishableKey } from "./validation";

export function getPublicEnv() {
  // Next.js requires literal process.env accesses for browser substitution.
  return {
    supabaseUrl: httpOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    supabasePublishableKey: publishableKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  };
}
