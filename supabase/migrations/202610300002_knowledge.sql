-- Commit the new index and status together; old fragments survive failed retries.
create function public.replace_source_index(p_source_id uuid, p_chunks jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare w uuid;
begin
 select workspace_id into w from public.sources where id=p_source_id for update;
 if w is null then return; end if;
 delete from public.source_chunks where source_id=p_source_id;
 insert into public.source_chunks(workspace_id,source_id,position,content,page_ref,embedding)
 select w,p_source_id,(c->>'position')::integer,c->>'content',c->>'page_ref',(c->>'embedding')::extensions.vector
 from jsonb_array_elements(p_chunks) c;
 update public.sources set status='ready',error_message=null where id=p_source_id;
end $$;
revoke all on function public.replace_source_index(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.replace_source_index(uuid,jsonb) to service_role;

-- Transactional, per-user rate limit: lock serializes simultaneous requests.
create function public.reserve_ai_request(p_workspace_id uuid,p_user_id uuid,p_request_type text,p_limit integer)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if (select count(*) from public.ai_requests where user_id=p_user_id and created_at>now()-interval '1 hour' and request_type<>'embedding') >= p_limit then
   raise exception 'AI_RATE_LIMIT' using errcode='P0001';
 end if;
 insert into public.ai_requests(workspace_id,user_id,request_type,status) values(p_workspace_id,p_user_id,p_request_type,'processing') returning id into result;
 return result;
end $$;
revoke all on function public.reserve_ai_request(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_request(uuid,uuid,text,integer) to service_role;
