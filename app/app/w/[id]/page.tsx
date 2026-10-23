"use client";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { data } from "@/lib/data";

/** Тетрадь открывается на первой странице */
export default function WorkspaceIndex() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    data.listCanvases(id)
      .then(async (list) => {
        const first = list[0] ?? (await data.createCanvas(id));
        router.replace(`/app/w/${id}/p/${first.id}`);
      })
      .catch(() => setMissing(true));
  }, [id, router]);

  if (missing) notFound();
  return <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center" }}><Spinner /></div>;
}
