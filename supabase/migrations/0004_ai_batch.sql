-- Several designs per AI step (D-018): with N Gemini keys the step scores up to N designs at once.
-- Same selection as ai_next's scoring phase; when nothing is left it hands over to ai_next (finalists/completion).
create function public.ai_next_batch(p_run uuid, p_limit int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.ai_runs;
  items jsonb;
begin
  perform public._require_admin();
  select * into r from public.ai_runs where id = p_run;
  if r.id is null then raise exception 'NOT_FOUND'; end if;
  if r.status = 'running' and r.phase = 'scoring' then
    select jsonb_agg(jsonb_build_object('submission_id', x.submission_id, 'version_id', x.version_id, 'storage_key', x.storage_key,
                                        'mime_type', x.mime_type, 'size', x.file_size_bytes))
      into items
      from (
        select s.id as submission_id, v.id as version_id, v.storage_key, v.mime_type, v.file_size_bytes
          from public.submissions s
          join public.submission_versions v on v.id = s.active_version_id
          left join public.ai_scores a on a.run_id = r.id and a.submission_id = s.id
         where s.event_id = r.event_id
           and (a.id is null or (a.status = 'failed' and a.attempts < 3))
         order by a.attempts nulls first, s.first_received_at
         limit greatest(1, least(coalesce(p_limit, 1), 8))
      ) x;
    if items is not null then
      return jsonb_build_object('state', 'score', 'items', items);
    end if;
  end if;
  return public.ai_next(p_run);
end;
$$;

revoke execute on function public.ai_next_batch(uuid, int) from public, anon;
grant execute on function public.ai_next_batch(uuid, int) to authenticated;
