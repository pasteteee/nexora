# Переменные окружения

Шаблон — `.env.example`. Секреты в репозиторий не коммитятся (`.env*` в `.gitignore`).

| Переменная | Где | Назначение |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | клиент + сервер | адрес проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | клиент + сервер | публичный ключ, права ограничены RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | только сервер | фоновые задачи, журнал `ai_requests` |
| `AI_PROVIDER`, `AI_API_KEY`, `EMBEDDINGS_API_KEY` | только сервер | адаптер ИИ (ADR-002) |
| `MAX_UPLOAD_MB` и др. лимиты | сервер | меняются без правки кода (п. 4.2.6) |

Без `NEXT_PUBLIC_SUPABASE_*` приложение запускается в **демо-режиме**: данные хранятся
в браузере (localStorage). Это нужно для разработки интерфейса до подключения стенда.

## Supabase
1. Создать проект, включить расширение `vector`.
2. `supabase db push` — миграции из `supabase/migrations`.
3. Выполнить `supabase/storage.sql` — приватные бакеты.
4. Auth → SMTP: подключить внешний SMTP (встроенный только для тестов, п. 4.3.5).
