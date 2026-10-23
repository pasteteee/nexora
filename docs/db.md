# База данных

Схема, RLS, RPC и проверки описаны в [supabase/README.md](../supabase/README.md) (Антон Редько, карточка #5).
Типы для клиента: `lib/supabase/database.types.ts`.

```bash
supabase link --project-ref <ref>
supabase db push
```

Модель объекта холста — одна таблица `elements`: геометрия в колонках, содержимое и стиль в JSONB
(п. 4.3.1.1), поэтому новый тип объекта не требует новой таблицы.
