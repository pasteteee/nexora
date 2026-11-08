-- Nexora: тема тетради (бумага, цвета и шрифт заголовков редактора страниц).
-- Тему меняет владелец, как и название: та же политика workspaces_update.
alter table public.workspaces
  add column theme text not null default 'clean'
  check (theme in ('clean', 'grid', 'lined', 'dots', 'kraft', 'night', 'board'));

grant update(theme) on public.workspaces to authenticated;
