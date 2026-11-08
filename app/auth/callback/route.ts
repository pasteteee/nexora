import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { oauthDisplayName } from "@/lib/oauth-name";

/** Возврат после входа через Google: обмен PKCE-кода на сессию и переход по безопасному ?next=. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // у нового аккаунта из Google имя профиля пустое: берём его из Google
      const name = oauthDisplayName(data.user.user_metadata);
      if (name) {
        await sb.from("profiles").update({ display_name: name }).eq("id", data.user.id).eq("display_name", "");
      }
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  const back = new URL("/login", url.origin);
  back.searchParams.set("oauth", "failed");
  if (next !== "/app") back.searchParams.set("next", next);
  return NextResponse.redirect(back);
}
