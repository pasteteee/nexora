# Развёртывание Nexora

Целевая схема: приложение на **Vercel**, данные, вход, файлы и realtime в **Supabase**.
Текущий проект Supabase: `nexora`, ref `gattldfwkbvkxodshzwb`, PostgreSQL 17.
Хронология первого обновления стенда: [deploy-2026-10-30.md](deploy-2026-10-30.md).

## 0. Что нужно

- Node.js 22.18+ (рекомендуется 24), npm.
- Доступ к проекту Supabase (Dashboard) и Supabase CLI через `npx --yes supabase@2.121.0`.
- Проект Vercel, подключённый к репозиторию `pasteteee/nexora`.
- Ключи: Google Gemini (embeddings) и провайдера генерации (xAI, Anthropic или OpenAI).
- Почта для писем Auth: Gmail с паролем приложения или другой SMTP.

## 1. Проверить сборку локально

```bash
npm ci
npm run typecheck && npm run lint && npm test && npm run build && npm run test:infra
npm run check:client-secrets
bash scripts/db-test-local.sh   # если установлен PostgreSQL 16, см. db.md
```

## 2. Supabase

Порядок важен: миграции → Auth → почта.

1. **Миграции.** Все файлы `supabase/migrations` по порядку ([db.md](db.md#применение-к-supabase)):
   ```bash
   npx --yes supabase@2.121.0 login
   npx --yes supabase@2.121.0 link --project-ref gattldfwkbvkxodshzwb
   npx --yes supabase@2.121.0 migration list --linked
   npx --yes supabase@2.121.0 db push --linked --dry-run
   npx --yes supabase@2.121.0 db push --linked
   ```
   `20261030210000_optional_email_verification.sql` применяется **до** отключения Confirm email
   (см. [optional-email-verification.md](optional-email-verification.md)).
2. **Authentication → Sign In / Providers → Email:** Email provider включён, **Confirm email**
   выключен. Пользователь входит сразу, почту подтверждает добровольно из профиля.
3. **Authentication → URL Configuration:** Site URL = `https://<домен>`; Redirect URLs:
   `https://<домен>/auth/confirm`, `https://<домен>/reset-password` и такие же адреса для
   localhost и preview.
4. **Почта Auth (SMTP).** `npm run smtp:configure`, затем `npm run smtp:check`
   ([environments.md](environments.md)). Шаблон Magic Link должен содержать `{{ .ConfirmationURL }}`.
5. **Storage.** Бакет `nexora-sources` создаётся миграцией: приватный, 25 МиБ,
   PDF/PPTX/TXT/MD/PNG/JPEG. Делать его публичным нельзя.
6. **Realtime.** Отдельной настройки не требуется: миграция `20261108210000_nexora_realtime.sql`
   создаёт триггеры broadcast и политики `realtime.messages`. Клиент подключается к приватным
   каналам, поэтому доступ решают эти политики. В Realtime → Settings можно дополнительно запретить
   публичные каналы.
7. **API schemas:** `public` и `graphql_public`. Схему `nexora_private` в API не добавлять.

## 3. Vercel

1. **Settings → Environment Variables** — отдельно для Production и Preview
   (полный список и правила — [env.md](env.md)):

   | Обязательно | Для материалов и ИИ | Необязательно |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_URL` | `SUPABASE_SECRET_KEY`, `AI_PROVIDER`, `AI_API_KEY`, `EMBEDDINGS_API_KEY` | `AI_MODEL`, `EMBEDDINGS_MODEL`, лимиты, `SMTP_*` для приглашений |

2. **Settings → General:** Node.js 24. Framework Preset — Next.js, команды по умолчанию.
3. **Functions:** включён Fluid compute; план должен позволять `maxDuration = 300` с
   (обработка документов `/api/sources/:id/process`). ИИ — 90 с, поиск — 60 с.
4. Не исключать опциональный пакет `@napi-rs/canvas` из установки: он нужен PDF.js.
5. Deploy. Preview создаётся на каждый PR; Production — из `main`.
6. После любой смены переменных — **Redeploy** (публичные значения фиксируются при сборке).

## 4. Проверка после развёртывания (smoke test)

1. Открыть лендинг, зарегистрировать новый аккаунт → сразу «Мои тетради».
2. Создать тетрадь → «Страница 1» → написать текст, обновить страницу: текст на месте.
3. Профиль → «Подтвердите почту» → письмо → ссылка → отметка подтверждения.
4. Загрузить PDF → статус «Готов к поиску» → найти факт → спросить помощника → ответ с цитатой →
   «Вставить на страницу».
5. «Поделиться» → пригласить второй аккаунт наблюдателем → принять → у него «Только просмотр».
   Правка у владельца видна второму аккаунту за ≤2 с.
6. Опубликовать страницу → открыть `/p/<slug>` в приватном окне → отключить → ссылка даёт 404.
7. Экспорт PNG, PDF, JSON.
8. Посторонний аккаунт по прямому адресу тетради получает «не найдено».

## Обновление стенда

1. PR в ветку спринта → CI зелёный → Preview проверен → QA мержит в `main`.
2. Если в релизе новые миграции: применить их **до** деплоя кода, который на них опирается
   (`db push --linked --dry-run`, затем `db push --linked`). Миграции пишутся совместимыми с
   предыдущей версией кода, чтобы откат Vercel не ломал приложение.
3. Production собирается из `main` автоматически. Откат — [recovery.md](recovery.md#неудачный-релиз).

## Без Vercel

Подойдёт любой хостинг Node.js: `npm ci && npm run build && npm start` (порт `PORT`, по умолчанию
3000). Переменные те же. Фоновая обработка документов использует `after()` из Next.js: процесс должен
жить до 300 с после ответа на запрос.
