-- Cover all columns of composite foreign keys (Supabase performance advisor).
create index elements_canvas_workspace_idx on public.elements(canvas_id, workspace_id);
create index canvas_snapshots_canvas_workspace_idx on public.canvas_snapshots(canvas_id, workspace_id);
create index publications_canvas_workspace_idx on public.publications(canvas_id, workspace_id);
create index source_chunks_source_workspace_idx on public.source_chunks(source_id, workspace_id);
