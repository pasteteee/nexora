"use client";
import type { AuthApi } from "./api";
import { ApiError } from "./api";
import { supabaseBrowser } from "@/lib/supabase/client";

const origin = () => (typeof window === "undefined" ? "" : window.location.origin);

function fail(e: { message: string; status?: number } | null): void {
  if (!e) return;
  if (e.message.includes("Email not confirmed")) throw new ApiError("Подтвердите e-mail — ссылка в письме", "auth");
  if (e.message.includes("Invalid login")) throw new ApiError("Неверный e-mail или пароль", "auth");
  if (e.status === 429) throw new ApiError("Слишком много попыток, попробуйте позже", "limit");
  throw new ApiError(e.message, "network");
}

export const supabaseAuth: AuthApi = {
  async current() {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    const { data: p } = await sb.from("profiles").select("display_name, email_verified_at").eq("id", data.user.id).single();
    return { id: data.user.id, email: data.user.email ?? "", displayName: p?.display_name ?? "", emailVerified: Boolean(p?.email_verified_at) };
  },
  async signUp(email, password, displayName) {
    const { error } = await supabaseBrowser().auth.signUp({
      email, password,
      options: { data: { display_name: displayName.trim() }, emailRedirectTo: `${origin()}/login?confirmed=1` },
    });
    // повторная регистрация на тот же адрес не раскрывает, что он занят
    if (error && !error.message.includes("already registered")) fail(error);
  },
  async signIn(email, password) {
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    fail(error);
  },
  async signOut() { await supabaseBrowser().auth.signOut(); },
  async resendConfirmation(email) {
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email,
      options: { shouldCreateUser: false, emailRedirectTo: `${origin()}/auth/confirm` },
    });
    fail(error);
  },
  async requestPasswordReset(email) {
    // ответ одинаковый для любого адреса (п. 4.2.2)
    await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo: `${origin()}/reset-password` });
  },
  async updatePassword(password) {
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    fail(error);
  },
  async updateProfile(displayName) {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new ApiError("Войдите в систему", "auth");
    const { error } = await sb.from("profiles").update({ display_name: displayName.trim() }).eq("id", data.user.id);
    fail(error);
  },
};
