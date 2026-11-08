"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { collab, InvitationError, invitationMessages, type InvitationFailure } from "@/lib/collab";
import { auth } from "@/lib/data";
import { useSession } from "@/lib/session";

/** Принятие приглашения: только после явного нажатия и только учётной записью с адресом из письма */
export function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { profile } = useSession();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<InvitationFailure | "network" | null>(null);

  async function accept() {
    setBusy(true);
    setFailure(null);
    try {
      const workspaceId = await collab.acceptInvitation(token);
      router.replace(`/app/w/${workspaceId}`);
    } catch (e) {
      setFailure(e instanceof InvitationError ? e.reason : "network");
      setBusy(false);
    }
  }
  async function switchAccount() {
    await auth.signOut();
    router.replace(`/login?next=${encodeURIComponent(`/app/invite/${token}`)}`);
  }

  if (failure && failure !== "network") {
    return (
      <StatusScreen code="✉" text={invitationMessages[failure]}>
        {failure === "email_unverified" && <Button onClick={() => router.push("/app/profile")}>Подтвердить e-mail</Button>}
        {failure === "email_mismatch" && <Button onClick={switchAccount}>Войти другим аккаунтом</Button>}
        <Button variant="ghost" onClick={() => router.push("/app")}>К моим тетрадям</Button>
      </StatusScreen>
    );
  }
  return (
    <StatusScreen code="✉" text="Вас пригласили в тетрадь Nexora">
      <p style={{ margin: "0 0 12px", maxWidth: 420 }}>
        Вы вошли как <b>{profile?.email}</b>. Приглашение примет только тот адрес, на который оно отправлено.
      </p>
      {failure === "network" && <p role="alert">Не удалось связаться с сервером. Попробуйте ещё раз.</p>}
      <Button onClick={accept} disabled={busy}>{busy ? "Принимаем…" : "Принять приглашение"}</Button>
      <Button variant="ghost" onClick={switchAccount} disabled={busy}>Другой аккаунт</Button>
    </StatusScreen>
  );
}
