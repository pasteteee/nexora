# Nexora — интеллектуальный холст знаний

Nexora — тетради как хранилище знаний. Заметки, конспекты, формулы, графики, фото и файлы
лежат на страницах одной тетради и находятся поиском, а не теряются в разных папках. К тетради можно загрузить
PDF, PPTX, TXT/MD, искать по ним по смыслу и спрашивать ИИ-помощника с цитатами из источников.
Тетрадью можно поделиться с другими людьми (редактор или наблюдатель), работать вместе
в реальном времени, опубликовать страницу по ссылке и экспортировать её в PNG, PDF или JSON.

ТЗ: «АИС Интеллектуальный холст знаний» (исправленная редакция).

## Стек

| Слой | Что используется |
|---|---|
| Интерфейс и сервер | Next.js 16 (App Router), React 19, TypeScript, Zustand, CSS Modules + Tailwind 4 |
| Данные | Supabase: PostgreSQL 17, RLS, pgvector, Auth, приватный Storage, Realtime |
| ИИ | генерация: xAI / Anthropic / OpenAI (`AI_PROVIDER`), векторы: OpenAI embeddings |
| Хостинг | Vercel (Node.js 22+, рекомендуется 24) |
| Проверки | Vitest, ESLint, `tsc`, pgTAP, GitHub Actions |

## Быстрый старт (демо-режим, без ключей)

```bash
npm ci
npm run dev          # http://localhost:3000
```

Если `NEXT_PUBLIC_SUPABASE_*` не заданы (или в ключе осталась заглушка `replace_me`),
приложение работает в **демо-режиме**: аккаунты, тетради и страницы хранятся в localStorage
браузера, совместная работа идёт между вкладками через `BroadcastChannel`, письма-приглашения
показываются в демо-ящике. Загрузка и обработка документов и ИИ в демо-режиме недоступны.

## Запуск с Supabase

1. `cp .env.example .env.local` и заполните переменные ([docs/env.md](docs/env.md)).
2. Примените миграции к проекту Supabase ([docs/db.md](docs/db.md)):
   ```bash
   npx --yes supabase@2.121.0 link --project-ref <ref>
   npx --yes supabase@2.121.0 db push --linked
   ```
3. Настройте Auth (Confirm email, URL, SMTP) по [docs/deploy.md](docs/deploy.md#2-supabase).
4. `npm run dev`.

Развёртывание на Vercel целиком: [docs/deploy.md](docs/deploy.md).

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер на :3000 |
| `npm run build` / `npm start` | production-сборка и её запуск |
| `npm run typecheck` | TypeScript без сборки |
| `npm run lint` | ESLint |
| `npm test` | unit- и интеграционные тесты (Vitest) |
| `npm run test:infra` | проверки окружения и переменных |
| `npm run check:client-secrets` | ищет секреты в собранных клиентских файлах (после `build`) |
| `npm run smtp:check` / `smtp:configure` / `smtp:test` | SMTP для Supabase Auth ([docs/environments.md](docs/environments.md)) |
| `bash scripts/db-test-local.sh` | все миграции и pgTAP-тесты на локальном PostgreSQL 16 без Docker ([docs/db.md](docs/db.md#локальная-проверка-без-docker)) |

CI (`.github/workflows/ci.yml`) на каждый push в `main`, `sprint/**` и на каждый PR выполняет
`npm ci`, `typecheck`, `lint`, `test`, `build`, `test:infra`, `check:client-secrets`.

## Структура

```
app/            маршруты: лендинг, (auth), /app (тетради, редактор, профиль, приглашение),
                /p/[slug] (публичный просмотр), /api (ИИ, поиск, источники, публикация, приглашения)
components/     интерфейс: editor, knowledge, collab, export, public, notebooks, ui
lib/            data (Supabase и демо), editor (стор, автосохранение), realtime, collab,
                knowledge (извлечение, фрагменты, поиск), ai, export, env
supabase/       migrations, tests (pgTAP), config.toml
scripts/        db-test-local.sh, supabase-smtp.mjs, check-client-secrets.mjs
docs/           документация (ниже)
```

## Документация

| Документ | Для кого |
|---|---|
| [Руководство пользователя](docs/user-guide.md) | студенты и все, кто пишет конспекты |
| [Руководство администратора](docs/admin-guide.md) | тот, кто ведёт стенд: Supabase, Vercel, ключи, лимиты |
| [Развёртывание](docs/deploy.md) | первый запуск и обновление стенда |
| [Переменные окружения](docs/env.md) | полный список с правилами проверки |
| [База данных и миграции](docs/db.md) | схема, порядок миграций, тесты |
| [Восстановление после сбоев](docs/recovery.md) | что делать, если что-то сломалось |
| [Окружения и почта](docs/environments.md) | Storage, Gmail SMTP, разделение ключей |
| [Материалы и ИИ](docs/sprint-5.md), [совместная работа](docs/collaboration.md), [документный редактор](docs/document-editor.md) | устройство отдельных функций |
| [Слой данных](docs/data-layer.md), [дизайн-система](docs/design.md), [ADR](docs/adr/) | разработчикам |
| [Тест-план](docs/test-plan.md), [итоги спринтов](docs/sprints/) | QA и команде |

## Ветки

Работа идёт спринтами. Ветка спринта `sprint/N-<тема>`, задача — отдельная ветка `feat/…` или
`fix/…` с PR в ветку спринта. В `main` попадает только принятое тестировщиком.
Коммиты содержат номер карточки Trello: `docs: руководство пользователя [#43]`.
