# База данных и миграции

Полное описание схемы спринта 1 (таблицы, ограничения, RLS, RPC, Storage) —
[supabase/README.md](../supabase/README.md). Здесь — сводка, порядок миграций и способы проверки.
Типы для клиента: `lib/supabase/database.types.ts`.

## Схема коротко

| Таблица | Что хранит |
|---|---|
| `profiles` | имя, настройки интерфейса, `email_verified_at` (добровольное подтверждение почты) |
| `workspaces` | тетради; `deleted_at` — корзина на 30 дней |
| `workspace_members` | участники и роли `owner` / `editor` / `viewer` |
| `workspace_invitations` | приглашения: SHA-256 токена, роль, срок 72 ч |
| `canvases` | страницы тетради; `position`, `deleted_at` (корзина страниц) |
| `elements` | блоки страницы: геометрия в колонках, содержимое и стиль в JSONB; порядок документа в `content_json.documentOrder` |
| `sources` | материалы: путь в приватном бакете, MIME, размер, статус обработки |
| `source_chunks` | фрагменты текста и `vector(1536)` с HNSW-индексом |
| `publications` | публичные ссылки `/p/<slug>` на страницы |
| `canvas_snapshots` | неизменяемые снимки страниц |
| `ai_requests` | журнал запросов к ИИ и почасовой лимит |

Принципы:

- RLS включён везде. Роль определяется по `workspace_members` и `auth.uid()`, не по `user_metadata`.
- Служебные `security definer` функции лежат в схеме `nexora_private` (не экспонируется в API) с
  пустым `search_path`. Публичные RPC в `public` — `security invoker`-обёртки.
- Составные внешние ключи не дают связать объект с чужой тетрадью.
- Удаление мягкое (`deleted_at`): данные скрываются сразу, восстановление — 30 дней.

## Миграции по порядку

| # | Файл | Спринт | Что делает |
|---|---|---|---|
| 1 | `20261017103421_nexora_schema.sql` | 1 | 11 таблиц, RLS, права, RPC, pgvector, бакет `nexora-sources` |
| 2 | `20261017103932_nexora_foreign_key_indexes.sql` | 1 | индексы составных внешних ключей |
| 3 | `20261023100000_nexora_pages.sql` | 2 | имя профиля из регистрации, корзина страниц, `duplicate_canvas` |
| 4 | `20261023120000_nexora_images.sql` | 4 | изображения в Storage, `storage_workspace` |
| 5 | `202610300002_knowledge.sql` | 5 | `replace_source_index`, `reserve_ai_request`, `nearest_canvas_elements` |
| 6 | `202610300003_source_upload_validation.sql` | 5 | квоты: 25 МиБ на файл, 100 файлов и 500 МиБ на тетрадь |
| 7 | `20261030210000_optional_email_verification.sql` | 5 | `confirm_profile_email`, сброс проверки при смене адреса |
| 8 | `20261030220000_source_path_isolation.sql` | 5 | путь файла жёстко привязан к тетради и источнику |
| 9 | `20261108100000_collaboration.sql` | 6 | участники, роли, приглашения, публикации (`publish_canvas`, `set_member_role`, …) |
| 10 | `20261108210000_nexora_realtime.sql` | 6 | broadcast изменений `elements`, каналы `page:*`, `member:*`, политики `realtime.messages` |

Аудит безопасности спринта 7 (PR #15) добавляет `20261108230000_security_audit.sql`: не больше
20 приглашений в час на тетрадь, сверх лимита API отвечает 429. Отчёт — `docs/security-audit.md`.

## Правила для новых миграций

- Применённые файлы **не редактируются**. Изменение — новая миграция:
  `npx --yes supabase@2.121.0 migration new <name>`.
- Имя: `YYYYMMDDHHMMSS_<тема>.sql`, версия должна быть больше последней.
- Миграция должна работать со старой версией кода (сначала добавить, потом использовать,
  удалять в следующем релизе). Тогда откат Vercel безопасен.
- Новой таблице явно выдать права и написать RLS: в `config.toml` выключено
  `auto_expose_new_tables`.
- Каждая миграция с правами сопровождается pgTAP-тестом в `supabase/tests/`.
- После применения обновить типы (ниже).

## Применение к Supabase

```bash
npx --yes supabase@2.121.0 login
npx --yes supabase@2.121.0 link --project-ref gattldfwkbvkxodshzwb
npx --yes supabase@2.121.0 migration list --linked      # что уже применено
npx --yes supabase@2.121.0 db push --linked --dry-run   # что будет применено
npx --yes supabase@2.121.0 db push --linked
```

Перед `db push` на production сделайте резервную копию или убедитесь, что включены
ежедневные бэкапы / PITR ([recovery.md](recovery.md#резервные-копии)).
Без CLI миграцию можно выполнить в Dashboard → SQL Editor, но тогда версия не попадёт в
`supabase_migrations.schema_migrations`; добавьте её через `supabase migration repair --status applied <версия>`.

Обновление типов:

```bash
npx --yes supabase@2.121.0 gen types typescript --linked --schema public > lib/supabase/database.types.ts
```

## Тесты базы

pgTAP-тесты в `supabase/tests/`:

| Файл | Проверок | Что проверяет |
|---|---|---|
| `001_nexora_rls.test.sql` | 217 | RLS и права по ролям `anon`, `authenticated`, `service_role` |
| `003_source_quotas.test.sql` | 4 | квоты материалов |
| `004_collaboration.test.sql` | 49 | приглашения, роли, передача владения, публикации |

Тесты работают в транзакции и заканчиваются `ROLLBACK`: данных после себя не оставляют.

### С Docker (полный локальный Supabase)

```bash
npx --yes supabase@2.121.0 start
npx --yes supabase@2.121.0 db reset --local   # только локальная БД! не --linked
npx --yes supabase@2.121.0 test db --local
```

### Локальная проверка без Docker

`scripts/db-test-local.sh` поднимает временный PostgreSQL 16, применяет заглушку платформы
Supabase, все миграции и прогоняет все pgTAP-тесты. Подходит для CI-контейнеров и машин без Docker.

Установка (Debian/Ubuntu, репозиторий PGDG):

```bash
sudo apt-get install -y postgresql-16 postgresql-16-pgvector postgresql-16-pgtap
```

Запуск из корня репозитория:

```bash
bash scripts/db-test-local.sh
```

Ожидаемый вывод (проверено 08.11.2026):

```
migrations: ok (10)
001_nexora_rls.test.sql: ok=217 not_ok=0
003_source_quotas.test.sql: ok=4 not_ok=0
004_collaboration.test.sql: ok=49 not_ok=0
```

Как устроен скрипт:

1. `initdb` во временный каталог `mktemp -d`, запуск на порту `54329` с `wal_level=logical`.
   Под root команды выполняются от пользователя `postgres` (`runuser`).
2. `supabase/tests/local/supabase-stub.sql` создаёт роли `anon`, `authenticated`, `service_role`,
   схемы `auth`, `storage`, `realtime` и функции `auth.uid()` / `auth.jwt()` в минимальном виде.
   **Только для локальной проверки, на настоящий Supabase не применять.**
3. Все `supabase/migrations/*.sql` по алфавиту (= по версии) с `ON_ERROR_STOP`.
4. Каждый `supabase/tests/*.test.sql`: подсчёт `ok` / `not ok`; при `not ok` или `ERROR`
   печатаются первые 40 строк диагностики, код выхода 1.
5. При выходе сервер останавливается, каталог удаляется (`trap cleanup EXIT`).

Переменные: `PG_BIN` (по умолчанию `/usr/lib/postgresql/16/bin`), `PG_PORT` (`54329`).

Ограничения: заглушка проверяет логику SQL и RLS, но не настоящие Auth, Storage API и
доставку Realtime. Перед приёмкой миграции проверяются на стенде Supabase.

Частые ошибки:

| Сообщение | Причина |
|---|---|
| `extension "pgtap" is not available` | не установлен `postgresql-16-pgtap` |
| `extension "vector" is not available` | не установлен `postgresql-16-pgvector` |
| `could not bind ... port 54329` | порт занят: `PG_PORT=54330 bash scripts/db-test-local.sh` |
| `initdb: No such file` | PostgreSQL в другом каталоге: задайте `PG_BIN` |
