"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X, ChevronDown } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { demoMode } from "@/lib/data";
import {
  loadPreviewPage,
  previewPages,
  type PreviewChunk,
} from "@/lib/knowledge/preview";
import type { Source } from "@/lib/types";
import s from "./source-preview.module.css";

export function SourcePreview(props: { source: Source; onClose: () => void }) {
  return <Preview key={props.source.id} {...props} />;
}
function Preview({ source, onClose }: { source: Source; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [chunks, setChunks] = useState<PreviewChunk[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const live = useRef(true);
  const loading = useRef(false);
  const load = useCallback(
    async (after = -1) => {
      if (loading.current) return;
      loading.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await loadPreviewPage(
          supabaseBrowser(),
          source.workspaceId,
          source.id,
          after,
        );
        if (live.current) {
          setChunks((previous) =>
            after < 0 ? result.chunks : [...previous, ...result.chunks],
          );
          setHasMore(result.hasMore);
        }
      } catch (e) {
        if (live.current) setError((e as Error).message);
      } finally {
        loading.current = false;
        if (live.current) setBusy(false);
      }
    },
    [source.workspaceId, source.id],
  );
  useEffect(() => {
    live.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    if (!demoMode)
      queueMicrotask(() => {
        if (live.current) void load();
      });
    else
      queueMicrotask(() => {
        if (live.current) {
          setBusy(false);
          setError(
            "Предпросмотр извлечённого текста доступен после подключения Supabase и обработки материала.",
          );
        }
      });
    return () => {
      live.current = false;
      previous?.focus();
    };
  }, [load]);
  const pages = previewPages(chunks);
  const next = () => void load(chunks.at(-1)?.position ?? -1);
  return createPortal(
    <dialog
      ref={dialog}
      className={s.dialog}
      aria-labelledby="source-preview-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const rect = dialog.current.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <header className={s.header}>
        <FileText size={22} />
        <div>
          <span>ПРОСМОТР МАТЕРИАЛА</span>
          <h2 id="source-preview-title">{source.originalName}</h2>
        </div>
        <button onClick={onClose} aria-label="Закрыть просмотр">
          <X size={20} />
        </button>
      </header>
      <p className={s.hint}>
        Извлечённый текст · номера страниц и слайдов сохранены. Оригинальное
        оформление доступно в исходном файле.
      </p>
      <div className={s.layout}>
        <nav className={s.navigation} aria-label="Страницы материала">
          {pages.map((page, index) => (
            <button
              key={page.key}
              onClick={() =>
                scroll.current
                  ?.querySelector(`[data-preview-index="${index}"]`)
                  ?.scrollIntoView({ block: "start", behavior: "smooth" })
              }
            >
              {page.ref || "Текст документа"}
            </button>
          ))}
          {hasMore && (
            <span>Остальные страницы появятся после загрузки продолжения.</span>
          )}
        </nav>
        <div className={s.content} ref={scroll}>
          {error && (
            <div className={s.error} role="alert">
              <p>{error}</p>
              {!demoMode && <button onClick={next}>Повторить</button>}
            </div>
          )}
          {!busy && !error && !pages.length && (
            <div className={s.empty}>
              <FileText size={36} />
              <h3>Текста пока нет</h3>
              <p>
                {source.status === "requires_ocr"
                  ? "В этом PDF нет извлекаемого текстового слоя. Для просмотра используйте оригинал; поиск требует OCR."
                  : source.mimeType.startsWith("image/")
                    ? "Это изображение. Откройте оригинальный файл в списке материалов."
                    : source.status !== "ready"
                      ? "Дождитесь обработки материала или повторите её в списке материалов."
                      : "В материале не найден извлекаемый текст."}
              </p>
            </div>
          )}
          {pages.map((page, index) => (
            <article
              className={s.page}
              key={page.key}
              data-preview-index={index}
            >
              <h3>{page.ref || "Текст документа"}</h3>
              <p>{page.text}</p>
            </article>
          ))}
          {busy && (
            <p role="status" className={s.status}>
              Загружаем текст…
            </p>
          )}
          {!busy && hasMore && (
            <button className={s.more} onClick={next}>
              <ChevronDown size={16} />
              Загрузить продолжение
            </button>
          )}
        </div>
      </div>
      <footer className={s.footer}>
        {pages.length} {pages.length === 1 ? "раздел" : "разделов"}
        {hasMore ? " · показана часть материала" : ""}
        <span>Приватный материал тетради</span>
      </footer>
    </dialog>,
    document.body,
  );
}
