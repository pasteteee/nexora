# Переменные окружения

Шаблоны: `.env.example` (приложение) и `.env.smtp.example` (операционный скрипт SMTP).
Рабочие значения хранятся только в `.env.local` / `.env.smtp.local` (игнорируются Git) или в
Vercel → Settings → Environment Variables. Секреты в репозиторий, чат и логи не попадают.

## Правило про `NEXT_PUBLIC_`

Всё с префиксом `NEXT_PUBLIC_` вшивается в JavaScript браузера при сборке. Поэтому:

- разрешены только `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (плюс системные `NEXT_PUBLIC_VERCEL_*` без слов SECRET/TOKEN/BYPASS/KEY/PASS);
- `next.config.ts` останавливает `dev` и `build`, если появилась другая публичная переменная или
  в публичное значение попал `sb_secret_` / `service_role`;
- после изменения публичных значений нужна **новая сборка** (Redeploy), перезапуска мало;
- `npm run check:client-secrets` после `build` ищет секреты в готовых клиентских файлах.

Серверные модули (`lib/env/server.ts`, `lib/storage/source-download.ts` и др.) помечены
`import "server-only"`: импорт в клиентский компонент ломает сборку.

## Приложение (`.env.local`, Vercel)

| Переменная | Обяз. | По умолчанию | Где | Назначение и проверка |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | для стенда | — | клиент + сервер | origin проекта Supabase. Только `https://` (для localhost допустим `http://`), без пути, логина, query и hash |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | для стенда | — | клиент + сервер | ключ `sb_publishable_…` (≥16 символов после префикса). Права ограничены RLS. Secret и legacy `service_role` JWT отвергаются |
| `APP_URL` | да на стенде | `http://localhost:3000` | сервер | origin приложения, из него строится ссылка-приглашение `/app/invite/<token>`. На стенде — HTTPS-адрес развёртывания |
| `SUPABASE_SECRET_KEY` | для материалов и ИИ | — | только сервер | `sb_secret_…`. Нужен обработчику документов и журналу `ai_requests`. Обходит RLS, читается лениво только после проверки прав |
| `CRON_SECRET` | для очистки корзины | — | только сервер | случайная строка от 16 символов. Vercel Cron передаёт её в `Authorization: Bearer …` при ежедневном вызове `/api/cron/purge-trash` (расписание в `vercel.json`): тетради и страницы старше 30 дней удаляются вместе с файлами |
| `SOURCE_SIGNED_URL_TTL_SECONDS` | нет | `60` | сервер | срок подписанной ссылки на оригинал файла, 1–300 с |
| `AI_PROVIDER` | для ИИ | `xai` | только сервер | `xai`, `anthropic` или `openai` |
| `AI_MODEL` | нет | `grok-4.7` / `claude-sonnet-4-5` / `gpt-4.1-mini` | только сервер | модель выбранного провайдера |
| `AI_API_KEY` | для ИИ | — | только сервер | ключ провайдера генерации |
| `EMBEDDINGS_API_KEY` | для поиска | — | только сервер | ключ OpenAI для векторов (отдельно от `AI_API_KEY`) |
| `EMBEDDINGS_MODEL` | нет | `text-embedding-3-small` | только сервер | должна давать 1536 измерений. Смена — только с переиндексацией ([admin-guide.md](admin-guide.md#смена-модели-embeddings)) |
| `MAX_UPLOAD_MB` | нет | `25` | сервер | максимальный размер файла при обработке (`lib/knowledge/process.ts`) |
| `WORKSPACE_MAX_SOURCES` | нет | `100` | сервер | материалов в одной тетради. **Сейчас код его не читает**: квоту 100 проверяет триггер БД `enforce_source_quota` |
| `WORKSPACE_MAX_MB` | нет | `500` | сервер | суммарный объём материалов тетради. **Сейчас код его не читает**: квоту 500 МиБ проверяет тот же триггер |
| `AI_REQUESTS_PER_HOUR` | нет | `30` | сервер | общий почасовой лимит пользователя на ИИ, поиск и запуск обработки |
| `SEARCH_MIN_SIMILARITY` | нет | `0.3` | сервер | порог косинусного сходства для результатов поиска |
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` (`Nexora`) | нет | — | только сервер | письма-приглашения в тетрадь. Без них приглашение создаётся, а владелец получает ссылку и передаёт её сам |

Лимиты в переменных можно только **ужесточить**: в БД и Storage заданы свои пределы
(25 МиБ на файл, 100 файлов / 500 МиБ на тетрадь), и увеличение переменных их не отменяет.
Чтобы изменить квоты тетради, нужна новая миграция для `nexora_private.enforce_source_quota`
и лимита bucket `nexora-sources`.

### Какой набор нужен

| Режим | Переменные |
|---|---|
| Демо (разработка интерфейса) | ничего |
| Вход, тетради, редактор, совместная работа, публикация | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_URL` |
| + материалы, поиск, ИИ | `SUPABASE_SECRET_KEY`, `AI_PROVIDER`, `AI_API_KEY`, `EMBEDDINGS_API_KEY` |
| + письма-приглашения | `SMTP_*` |

## Операционный скрипт SMTP (`.env.smtp.local`)

Не загружается Next.js, читается только `scripts/supabase-smtp.mjs` (`npm run smtp:*`).

| Переменная | Назначение |
|---|---|
| `SUPABASE_PROJECT_REF` | ref проекта Supabase (сейчас `gattldfwkbvkxodshzwb`) |
| `SUPABASE_ACCESS_TOKEN` | личный токен Management API. Только для скрипта, не для приложения |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` | почта для писем Supabase Auth. Для Gmail — пароль приложения, `SMTP_USER` = `SMTP_FROM_EMAIL` |
| `SMTP_TEST_TO` | ваш адрес для одного проверочного письма `smtp:test` |

Подробно: [environments.md](environments.md).

## Окружения

Для Development, Preview и Production — отдельные наборы. Каждому Supabase-проекту
соответствуют свои URL, publishable и secret key; миграции применяются к каждому проекту.
В Supabase Auth для каждого окружения задаются свой Site URL и точные Redirect URLs
(`/auth/confirm`, `/reset-password`). Порядок — в [deploy.md](deploy.md).

## Ротация ключей

1. Создайте новый ключ (Supabase → Settings → API Keys, консоль провайдера ИИ).
2. Обновите значение в Vercel для нужных окружений и выполните Redeploy.
3. Проверьте вход, поиск и вопрос помощнику, затем отзовите старый ключ.

При утечке сначала отзовите ключ, потом заменяйте: см. [recovery.md](recovery.md#утечка-ключа).
