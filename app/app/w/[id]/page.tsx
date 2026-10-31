"use client";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { ApiError, data } from "@/lib/data";

/** Тетрадь открывается на первой странице */
export default function WorkspaceIndex() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [failure, setFailure] = useState<{ id: string; missing: boolean; message?: string } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    data.listCanvases(id)
      .then(async (list) => {
        const first = list[0] ?? (await data.createCanvas(id));
        if (alive) router.replace(`/app/w/${id}/p/${first.id}`);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError && e.code === "not_found") setFailure({ id, missing: true });
        else setFailure({ id, missing: false, message: e instanceof Error ? e.message : "Не удалось открыть тетрадь" });
      });
    return () => { alive = false; };
  }, [id, router, retry]);

  if (failure?.id === id && failure.missing) notFound();
  if (failure?.id === id) return <div style={{ position: "fixed", inset: 0, display: "grid", placeContent: "center", gap: 12, textAlign: "center" }}>
    <p role="alert">{failure.message}</p>
    <Button onClick={() => { setFailure(null); setRetry((n) => n + 1); }}>Повторить</Button>
  </div>;
  return <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center" }}><Spinner /></div>;
}
