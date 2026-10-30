import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      const { error: verificationError } = await sb.rpc("confirm_profile_email");
      if (!verificationError) return NextResponse.redirect(new URL("/app/profile?verified=1", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/app/profile?verification=failed", url.origin));
}
