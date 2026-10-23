# Переменные окружения

Шаблон — `.env.example`. Секреты в репозиторий не коммитятся (`.env*` в `.gitignore`).

| Переменная | Где | Назначение |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | клиент + сервер | адрес проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | клиент + сервер | публикуемый ключ `sb_publishable_…`, права ограничены RLS |
| `SUPABASE_SECRET_KEY` | только сервер | фоновые задачи (`sb_secret_…`), журнал `ai_requests` |
| `APP_URL`, `SOURCE_SIGNED_URL_TTL_SECONDS` | только сервер | адрес приложения, срок подписанной ссылки на файл |
| `AI_PROVIDER`, `AI_API_KEY`, `EMBEDDINGS_API_KEY` | только сервер | адаптер ИИ (ADR-002) |
| `MAX_UPLOAD_MB` и др. лимиты | сервер | меняются без правки кода (п. 4.2.6) |

Без `NEXT_PUBLIC_SUPABASE_*` приложение запускается в **демо-режиме**: данные хранятся
в браузере (localStorage). Это нужно для разработки интерфейса до подключения стенда.

## Supabase
Стенд и почта описаны в [docs/environments.md](environments.md), база — в [supabase/README.md](../supabase/README.md).
Миграции (включая приватный бакет `nexora-sources`): `supabase db push`.
