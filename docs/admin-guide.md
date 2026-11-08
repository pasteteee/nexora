# Руководство администратора Nexora

Для того, кто ведёт стенд: Supabase, Vercel, ключи, почта, лимиты и обращения пользователей.
Первичная установка — [deploy.md](deploy.md), переменные — [env.md](env.md), сбои — [recovery.md](recovery.md).

## Доступы

| Система | Что там | Кому нужен доступ |
|---|---|---|
| Supabase, проект `nexora` (`gattldfwkbvkxodshzwb`) | БД, Auth, Storage, Realtime, логи, бэкапы | Dev2 / администратор |
| Vercel | сборки, переменные, логи функций, откат | Dev1, администратор |
| GitHub `pasteteee/nexora` | код, CI, PR | команда |
| xAI / Anthropic / OpenAI / Google Gemini | ключи `AI_API_KEY`, `EMBEDDINGS_API_KEY`, расход | администратор |
| Gmail (пароль приложения) | SMTP для Auth и приглашений | администратор |

Принцип: secret key Supabase, ключи ИИ и SMTP-пароль хранятся только в Vercel и Supabase,
не в чатах и не в репозитории. Доступ к Dashboard — с двухфакторной аутентификацией.

## Как устроены права

Все права проверяет база (RLS и функции `security definer`), интерфейс лишь прячет кнопки.
Роли в тетради: `owner`, `editor`, `viewer` (таблица `workspace_members`). Матрица — в
[collaboration.md](collaboration.md) и [user-guide.md](user-guide.md#6-совместная-работа).
Глобальной роли «администратор приложения» нет: администратор работает через Supabase Dashboard.

**SQL Editor работает от `postgres` и обходит RLS.** Любой запрос ниже сначала выполняйте как
`select` с теми же условиями и проверяйте, что затронуто ровно то, что нужно.

Чтобы вызвать RPC от имени пользователя (с его проверками прав), в одной транзакции:

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<uuid пользователя>', 'role', 'authenticated')::text, true);
set local role authenticated;
-- здесь вызов RPC, например:
-- select public.restore_workspace('<uuid тетради>');
commit;
```

## Пользователи

| Задача | Как |
|---|---|
| Найти пользователя | Authentication → Users, поиск по e-mail. UUID = `profiles.id` |
| Сбросить пароль | Users → пользователь → Send password recovery |
| Заблокировать | Users → Ban user (вход запрещён, данные остаются) |
| Подтвердить почту вручную (только после проверки владения адресом) | `update public.profiles set email_verified_at = now() where id = '<uuid>';` |
| Удалить аккаунт | сначала передать или удалить его тетради (ниже): `workspaces.owner_id` защищён `on delete restrict`, удаление владельца тетрадей завершится ошибкой. Затем Users → Delete user |

Подтверждение почты в Auth (`email_confirmed_at`) после отключения Confirm email значит лишь
«вход разрешён». Доказательство владения адресом — `profiles.email_verified_at`
([optional-email-verification.md](optional-email-verification.md)).

## Тетради

**Восстановить удалённую (до 30 дней).** Владелец делает это сам в «Корзине». Если не может —
RPC от его имени: `select public.restore_workspace('<uuid тетради>');` (шаблон выше).

**Владелец ушёл, тетрадь нужна команде.** Передать владение участнику от имени владельца:
`select public.transfer_workspace_ownership('<uuid тетради>', '<uuid нового владельца>');`.
Новый владелец должен уже быть участником.

**Окончательная очистка.** Автоматической очистки тетрадей старше 30 дней нет. Раз в месяц:

```sql
-- 1. Кандидаты
select id, name, deleted_at from public.workspaces
 where deleted_at < now() - interval '30 days';
```

2. Для каждой удалите файлы в Storage → `nexora-sources` → папка `<uuid тетради>` (или через
   Storage API). Сначала файлы: иначе после удаления строк их путь уже не найти.
3. `delete from public.workspaces where id = '<uuid>';` — страницы, блоки, материалы, фрагменты,
   публикации, приглашения и журнал ИИ удалятся каскадом.

## Публикации

Список активных: `select p.slug, p.published_at, c.name, w.name from public.publications p
join public.canvases c on c.id = p.canvas_id join public.workspaces w on w.id = p.workspace_id
where p.is_active;`

Срочно закрыть ссылку (жалоба, утечка): `update public.publications set is_active = false where slug = '<slug>';`
Страница `/p/<slug>` сразу отдаёт 404. Повторная публикация владельцем создаст новый slug.

## Материалы и обработка

Статусы `sources.status`: `pending` → `processing` → `ready`, либо `error` / `requires_ocr`.

```sql
-- Что зависло или упало за сутки
select id, workspace_id, original_name, status, error_message, updated_at
  from public.sources
 where status in ('processing', 'error') and updated_at > now() - interval '1 day'
 order by updated_at desc;
```

- `processing` дольше 5 минут: функция была остановлена платформой. Пользователь может нажать
  повтор, задание перехватывается через 310 с. Массово: перевести в `pending` и попросить повторить.
- `error`: текст причины в `error_message`. Частые: битый файл, неверная сигнатура, превышены 500
  страниц PDF / 2000 фрагментов / 20 МиБ текста PPTX, недоступен ключ embeddings.
- `requires_ocr`: скан без текста. OCR в приложении нет.

### Смена модели embeddings

Все векторы индекса должны быть от одной модели размерности 1536.

1. Задать новый `EMBEDDINGS_MODEL` или `EMBEDDINGS_PROVIDER` (вектор 1536 измерений) в Vercel, Redeploy.
2. `update public.sources set status = 'pending' where status = 'ready';`
3. Пользователи (или скрипт от их имени) повторно запускают обработку. До переиндексации поиск
   по материалу недоступен.

Другая размерность требует миграции колонки `source_chunks.embedding` и HNSW-индекса.

## ИИ: лимиты, журнал, провайдер

- Лимит: `AI_REQUESTS_PER_HOUR` (по умолчанию 30) на пользователя; общий для вопросов, поиска и
  запуска обработки. Резервируется транзакционно до платного вызова (`reserve_ai_request`).
- Журнал: `public.ai_requests` (тип, статус, провайдер, ошибка). Расход за сутки:
  ```sql
  select request_type, status, count(*) from public.ai_requests
   where created_at > now() - interval '1 day' group by 1, 2 order by 3 desc;
  ```
- Сменить провайдера: `AI_PROVIDER` = `xai` | `anthropic` | `openai`, `AI_API_KEY`, при
  необходимости `AI_MODEL` → Redeploy. Индексы материалов не трогаются.
- Бюджет и лимиты расходов задавайте в консоли провайдера.

## Почта

- **Письма Auth** (подтверждение, сброс пароля): SMTP в Supabase Auth. Настройка и проверка:
  `npm run smtp:configure`, `npm run smtp:check`, `npm run smtp:test` ([environments.md](environments.md)).
- **Приглашения в тетрадь**: SMTP приложения, переменные `SMTP_*` в Vercel. Если почта не настроена
  или упала, приглашение всё равно создаётся, владелец видит ссылку и передаёт её сам.
- Gmail ограничивает число писем в сутки; при массовой регистрации нужен отдельный почтовый сервис.
- После аудита безопасности (PR #15) — не больше 20 приглашений в час на тетрадь, дальше 429.

## Наблюдение

| Где | Что смотреть |
|---|---|
| Vercel → Deployments → Functions / Logs | ошибки `/api/ai/ask`, `/api/search`, `/api/sources/*/process`, `/api/publish`, `/api/workspaces/*/invitations`; таймауты |
| Supabase → Logs (API, Postgres, Auth, Realtime) | 401/403 от RLS, ошибки миграций, письма Auth |
| Supabase → Advisors (Security, Performance) | после каждой миграции. Замечания Security должны быть пустыми |
| Supabase → Reports / Usage | размер БД и Storage, соединения Realtime |
| GitHub → Actions | CI на каждый PR |

## Безопасность

- Отчёт аудита спринта 7: [security-audit.md](security-audit.md). `next.config.ts` отдаёт заголовки
  безопасности; `/p/*` и `/app/invite/*` — с `no-referrer`, `noindex`, `no-store`.
- Не делать бакет `nexora-sources` публичным и не включать `nexora_private` в API schemas.
- `npm run check:client-secrets` должен проходить в CI: он ищет ключи в клиентских файлах.
- Подозрение на утечку ключа — [recovery.md](recovery.md#утечка-ключа).

## Регулярные задачи

| Когда | Что |
|---|---|
| Каждый релиз | CI зелёный, миграции через `db push --dry-run`, Advisors, smoke test из [deploy.md](deploy.md#4-проверка-после-развёртывания-smoke-test) |
| Еженедельно | зависшие материалы, ошибки функций в Vercel, расход ИИ |
| Ежемесячно | очистка тетрадей старше 30 дней, проверка восстановления из бэкапа, обновление зависимостей |
| Раз в семестр | ротация ключей ([env.md](env.md#ротация-ключей)) |
