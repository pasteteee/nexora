# Слой данных

Интерфейс один — `AuthApi` и `DataApi` в `lib/data/api.ts`. Компоненты импортируют только `lib/data`.

| Реализация | Файл | Когда используется |
|---|---|---|
| Supabase | `lib/data/supabase-auth.ts`, `lib/data/supabase-data.ts` | заданы `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Демо | `lib/data/local.ts` | ключей нет: всё хранится в браузере |

## Правила, общие для обеих реализаций
- Чужая и несуществующая тетрадь дают одинаковый ответ `not_found` (критерий 35).
- Читатель не может менять объекты (`forbidden`); переименование и корзина тетради — только владелец.
- Корзина хранит тетради и страницы 30 дней (`TRASH_DAYS`).
- Новая тетрадь создаётся сразу с «Страница 1».

## Ошибки
`ApiError(message, code)`, где `code` — `not_found | forbidden | invalid | limit | auth | network`.
Текст сообщения готов к показу пользователю.

## Миграции
| Файл | Что делает |
|---|---|
| `20261017103421_nexora_schema.sql` | схема, RLS, RPC, хранилище (Антон, PR #3) |
| `20261017103932_nexora_foreign_key_indexes.sql` | индексы внешних ключей |
| `20261023100000_nexora_pages.sql` | имя профиля из регистрации, корзина страниц (`canvases.deleted_at`), `duplicate_canvas(p_canvas_id)` |

Удаление и восстановление тетради — RPC `soft_delete_workspace` / `restore_workspace`.
