-- Приватные бакеты (ТЗ п. 4.1.4.1): доступ только через подписанные ссылки сервера
insert into storage.buckets (id, name, public, file_size_limit)
values ('sources', 'sources', false, 26214400),
       ('images', 'images', false, 26214400)
on conflict (id) do nothing;
