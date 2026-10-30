"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  Search,
  Sparkles,
  Upload,
  X,
  ArrowUp,
  Square,
  Plus,
  Trash2,
  RotateCw,
  ExternalLink,
} from "lucide-react";
import { data, demoMode } from "@/lib/data";
import { useEditor } from "@/lib/editor/store";
import { makeElement, topZ } from "@/lib/editor/factory";
import type { Source } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import s from "./knowledge.module.css";

type Match = {
  id: string;
  source_id: string;
  content: string;
  page_ref: string | null;
  sourceName: string;
  similarity: number;
};
const statuses = {
  pending: "Ожидает обработки",
  processing: "Индексируется…",
  ready: "Готов к поиску",
  error: "Ошибка обработки",
  requires_ocr: "Требуется OCR",
};
async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Не удалось выполнить операцию");
  }
  return response;
}

type PanelProps = { workspaceId: string; canvasId: string; canEdit: boolean };
export function KnowledgePanel(props: PanelProps) {
  return (
    <KnowledgePanelContent
      key={`${props.workspaceId}:${props.canvasId}`}
      {...props}
    />
  );
}
function KnowledgePanelContent({ workspaceId, canvasId, canEdit }: PanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"materials" | "ai">("materials");
  const [sources, setSources] = useState<Source[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Match[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [action, setAction] = useState("ask_workspace");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [replace, setReplace] = useState(false);
  const [original, setOriginal] = useState<{ id: string; text: string } | null>(
    null,
  );
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const selected = useEditor((st) => st.selected);
  const refresh = useCallback(async () => {
    setSources(await data.listSources(workspaceId));
  }, [workspaceId]);
  useEffect(() => {
    let alive = true;
    const load = () => {
      data
        .listSources(workspaceId)
        .then((rows) => alive && setSources(rows))
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
      abort.current?.abort();
    };
  }, [workspaceId]);

  async function process(id: string) {
    if (demoMode) {
      setError(
        "Обработка документов доступна после подключения Supabase и сервиса ИИ.",
      );
      return;
    }
    await checked(
      await fetch(`/api/sources/${id}/process`, { method: "POST" }),
    );
    await refresh();
  }
  async function openSource(
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) {
    if (demoMode) return;
    event.preventDefault();
    try {
      const {
        data: { session },
      } = await supabaseBrowser().auth.getSession();
      if (!session) throw new Error("Войдите в систему");
      const response = await checked(
        await fetch(`/api/sources/${id}/download`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      );
      const { signedUrl } = await response.json();
      window.location.assign(signedUrl);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const source = await data.uploadSource(workspaceId, file);
        await refresh();
        await process(source.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  async function find(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await checked(
        await fetch(
          `/api/search?workspaceId=${workspaceId}&q=${encodeURIComponent(query.trim())}`,
        ),
      );
      setResults((await response.json()).results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    setAnswer("");
    setCitations([]);
    setReplace(false);
    const state = useEditor.getState();
    const target = state.els[state.selected[0]];
    setOriginal(
      state.selected.length === 1 && target?.type === "text"
        ? { id: target.id, text: String(target.content.text || "") }
        : null,
    );
    try {
      const response = await checked(
        await fetch("/api/ai/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            canvasId,
            prompt,
            action,
            selectedIds: state.selected,
          }),
          signal: controller.signal,
        }),
      );
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Нет ответа");
      const decoder = new TextDecoder();
      let pending = "";
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "text") setAnswer((a) => a + event.text);
          if (event.type === "sources") setCitations(event.sources);
          if (event.type === "done") completed = true;
          if (event.type === "error") throw new Error(event.error);
        }
      }
      if (!completed && !controller.signal.aborted)
        throw new Error("Ответ прервался. Сохранённый черновик можно скопировать или запросить ответ повторно.");
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  function insert(text: string, source?: Match) {
    const st = useEditor.getState();
    if (!st.canEdit || st.canvasId !== canvasId) return;
    const y = Math.max(
      100,
      ...Object.values(st.els).map((e) => e.y + e.height + 32),
    );
    const element = makeElement(
      source ? "source_fragment" : "text",
      { x: 0, y: y + 100 },
      canvasId,
      topZ(st.els),
      {
        width: 560,
        height: Math.max(
          140,
          Math.min(900, Math.ceil(text.length / 60) * 25 + 60),
        ),
        content: source
          ? { text, name: source.sourceName, pageRef: source.page_ref }
          : { text, aiGenerated: true },
        sourceId: source?.source_id || null,
      },
    );
    if (st.add([element])) {
      st.select([element.id]);
      const viewport = document.querySelector<HTMLElement>("[data-notebook-viewport]");
      st.setCamera({ ...st.camera, x: (viewport?.clientWidth ?? 900) / 2,
        y: 100 - element.y * st.camera.zoom });
      setOpen(false);
    }
  }
  function applyReplacement() {
    const st = useEditor.getState();
    const target = original && st.els[original.id];
    if (!target || String(target.content.text || "") !== original?.text) {
      setError("Исходный текст изменился. Выполните запрос повторно.");
      setReplace(false);
      return;
    }
    st.apply(
      { [target.id]: { content: { ...target.content, text: answer } } },
      "text",
    );
    setReplace(false);
  }
  return (
    <>
      <button
        className={s.launcher}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="knowledge-panel"
      >
        <BookOpen size={17} /> Материалы и ИИ
      </button>
      {open && (
        <aside
          id="knowledge-panel"
          className={s.panel}
          aria-label="Материалы и ИИ"
        >
          <header className={s.header}>
            <div>
              <span className={s.eyebrow}>ВАША БАЗА ЗНАНИЙ</span>
              <h2>Всё под рукой</h2>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Закрыть панель">
              <X size={18} />
            </button>
          </header>
          <div className={s.tabs}>
            <button
              aria-pressed={tab === "materials"}
              onClick={() => {
                setTab("materials");
                setError("");
              }}
            >
              <BookOpen size={16} />
              Материалы <span>{sources.length}</span>
            </button>
            <button
              aria-pressed={tab === "ai"}
              onClick={() => {
                setTab("ai");
                setError("");
              }}
            >
              <Sparkles size={16} />
              Помощник
            </button>
          </div>
          <div className={s.body}>
            {demoMode && (
              <p className={s.notice}>
                Демо-режим. Подключите Supabase и ключи ИИ для обработки, поиска
                и ответов по материалам.
              </p>
            )}
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
            {tab === "materials" ? (
              <>
                <form className={s.search} onSubmit={find}>
                  <Search size={16} />
                  <input
                    aria-label="Семантический поиск"
                    placeholder="Найти мысль в материалах…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    maxLength={2000}
                  />
                  <button disabled={busy || demoMode} aria-label="Искать">
                    <ArrowUp size={15} />
                  </button>
                </form>
                {results !== null && (
                  <section className={s.results}>
                    <div className={s.sectionTitle}>
                      Найденные фрагменты{" "}
                      <button onClick={() => setResults(null)}>Сбросить</button>
                    </div>
                    {results.length === 0 ? (
                      <p className={s.muted}>
                        Подходящих фрагментов пока нет. Попробуйте другой запрос
                        или загрузите материал.
                      </p>
                    ) : (
                      results.map((r) => (
                        <article className={s.quote} key={r.id}>
                          <p>{r.content}</p>
                          <a
                            onClick={(e) => void openSource(e, r.source_id)}
                            href={`/api/sources/${r.source_id}/download`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.sourceName} · {r.page_ref || "Текст"}
                            <ExternalLink size={12} />
                          </a>
                          {canEdit && (
                            <button onClick={() => insert(r.content, r)}>
                              <Plus size={13} />
                              На страницу
                            </button>
                          )}
                        </article>
                      ))
                    )}
                  </section>
                )}
                {canEdit && (
                  <>
                    <input
                      ref={input}
                      type="file"
                      multiple
                      hidden
                      accept=".pdf,.pptx,.txt,.md,.png,.jpg,.jpeg"
                      onChange={(e) => void upload(e.target.files)}
                    />
                    <button
                      className={s.upload}
                      disabled={uploading}
                      onClick={() => input.current?.click()}
                    >
                      <Upload size={20} />
                      <strong>
                        {uploading ? "Загружаем…" : "Добавить материалы"}
                      </strong>
                      <span>PDF, PPTX, текст и изображения · до 25 МиБ</span>
                    </button>
                  </>
                )}
                <div className={s.sectionTitle}>Материалы тетради</div>
                {!sources.length && (
                  <div className={s.empty}>
                    <FileText size={32} />
                    <h3>Знания начинаются здесь</h3>
                    <p>
                      Добавьте лекцию, статью или презентацию. Находите нужное и
                      задавайте вопросы по содержимому.
                    </p>
                  </div>
                )}
                {sources.map((source) => (
                  <article className={s.source} key={source.id}>
                    <FileText size={20} />
                    <div className={s.sourceInfo}>
                      <strong title={source.originalName}>
                        {source.originalName}
                      </strong>
                      <span data-status={source.status}>
                        {statuses[source.status]} ·{" "}
                        {(source.size / 1024 / 1024).toFixed(1)} МиБ
                      </span>
                      {source.errorMessage && <p>{source.errorMessage}</p>}
                      <div className={s.sourceActions}>
                        <a
                          onClick={(e) => void openSource(e, source.id)}
                          href={
                            demoMode
                              ? source.dataUrl
                              : `/api/sources/${source.id}/download`
                          }
                          download={demoMode ? source.originalName : undefined}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть
                        </a>
                        {canEdit && (
                          <>
                            <button
                              onClick={() =>
                                void process(source.id).catch((e) =>
                                  setError(e.message),
                                )
                              }
                              disabled={demoMode}
                              title="Если обработка прервалась, повторный запуск доступен через 5 минут"
                            >
                              <RotateCw size={12} />
                              Повторить обработку
                            </button>
                            <button
                              aria-label={`Удалить ${source.originalName}`}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Удалить материал «${source.originalName}» и его индекс?`,
                                  )
                                )
                                  void data
                                    .deleteSource(source.id)
                                    .then(refresh)
                                    .catch((e) => setError(e.message));
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </>
            ) : (
              <>
                <div className={s.aiIntro}>
                  <span className={s.spark}>
                    <Sparkles size={22} />
                  </span>
                  <h3>Разберёмся вместе</h3>
                  <p>
                    Спрашивайте по материалам тетради или выделите текст, чтобы
                    поработать с ним.
                  </p>
                </div>
                <label className={s.mode}>
                  Контекст
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                  >
                    <option value="ask_workspace">Вся тетрадь</option>
                    <option value="ask_selection">
                      Выделение ({selected.length})
                    </option>
                    <option value="explain">Объяснить выделенное</option>
                    <option value="summarize">Кратко изложить</option>
                    <option value="rewrite">Переписать</option>
                    <option value="expand">Расширить</option>
                  </select>
                </label>
                <form onSubmit={ask} className={s.composer}>
                  <textarea
                    aria-label="Вопрос помощнику"
                    placeholder="Например: какие главные идеи этой лекции?"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={2000}
                    rows={4}
                  />
                  <div>
                    <span>{prompt.length}/2000</span>
                    {busy ? (
                      <button
                        type="button"
                        onClick={() => abort.current?.abort()}
                      >
                        <Square size={13} />
                        Остановить
                      </button>
                    ) : (
                      <button disabled={!canEdit || demoMode || !prompt.trim()}>
                        <ArrowUp size={16} />
                        Спросить
                      </button>
                    )}
                  </div>
                </form>
                {!canEdit && (
                  <p className={s.notice}>
                    ИИ доступен владельцу и редакторам тетради.
                  </p>
                )}
                {busy && !answer && (
                  <p role="status" className={s.muted}>
                    Изучаем материалы…
                  </p>
                )}
                {answer && (
                  <section className={s.answer}>
                    <div className={s.sectionTitle}>
                      <Sparkles size={14} />
                      Черновик ИИ
                    </div>
                    <p>{answer}</p>
                    {!citations.length && (
                      <span className={s.notice}>
                        Без опоры на загруженные материалы
                      </span>
                    )}
                    {!busy && canEdit && (
                      <div className={s.answerActions}>
                        <button onClick={() => insert(answer)}>
                          <Plus size={14} />
                          Вставить на страницу
                        </button>
                        {original && action !== "ask_workspace" && (
                          <button onClick={() => setReplace(true)}>
                            Заменить исходный текст…
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                )}
                {replace && (
                  <div
                    className={s.confirm}
                    role="alertdialog"
                    aria-label="Подтвердить замену"
                  >
                    <p>
                      Заменить выделенный текст этим ответом? Изменение можно
                      отменить в редакторе.
                    </p>
                    <button onClick={applyReplacement}>
                      Подтвердить замену
                    </button>
                    <button onClick={() => setReplace(false)}>Отмена</button>
                  </div>
                )}
                {citations.length > 0 && (
                  <section>
                    <div className={s.sectionTitle}>Найдено в материалах</div>
                    {citations.map((c, i) => (
                      <details className={s.citation} key={c.id}>
                        <summary>
                          [{i + 1}] {c.sourceName} · {c.page_ref || "Текст"}
                        </summary>
                        <blockquote>{c.content}</blockquote>
                        <a
                          onClick={(e) => void openSource(e, c.source_id)}
                          href={`/api/sources/${c.source_id}/download`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть источник
                        </a>
                      </details>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
          <footer className={s.footer}>
            {tab === "ai"
              ? "Ответы ИИ могут содержать ошибки. Проверяйте источники."
              : "Материалы доступны только участникам этой тетради."}
          </footer>
        </aside>
      )}
    </>
  );
}
