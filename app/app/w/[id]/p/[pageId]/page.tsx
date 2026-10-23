"use client";
import { useParams } from "next/navigation";
import { EditorShell } from "@/components/editor/EditorShell";

export default function PageRoute() {
  const { id, pageId } = useParams<{ id: string; pageId: string }>();
  return <EditorShell workspaceId={id} canvasId={pageId} />;
}
