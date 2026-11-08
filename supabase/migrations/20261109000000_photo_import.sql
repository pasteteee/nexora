-- Фото в тетрадь: распознавание снимков считается запросом к ИИ и входит в общий часовой лимит.
alter table public.ai_requests drop constraint ai_requests_request_type_check;
alter table public.ai_requests add constraint ai_requests_request_type_check check (
  request_type in ('ask_workspace','ask_selection','explain','summarize','rewrite','expand','diagram','embedding','search','source_processing','photo_import')
);
