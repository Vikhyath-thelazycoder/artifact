-- Row level security and the private submissions bucket (SECURITY.md T-01, T-02, T-03, T-06, T-07).

create function public.staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where user_id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.staff_role() = 'admin', false)
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.staff_role() is not null
$$;

create function public.current_event_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.events where is_current
$$;

-- Uploads are open while the round is live, up to deadline + grace (D-005).
create function public.upload_window_open(e public.events) returns boolean
language sql stable as $$
  select e.status = 'live' and now() <= e.deadline_at + make_interval(secs => e.grace_seconds)
$$;

alter table public.staff enable row level security;
alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_versions enable row level security;
alter table public.scores enable row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_scores enable row level security;
alter table public.results enable row level security;
alter table public.audit_logs enable row level security;

-- Nothing is written directly by clients: every write is an RPC.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

create policy staff_read on public.staff for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Events (theme included) are read by participants only through my_status()/public_board(), which hide the
-- theme until the round starts.
create policy events_staff_read on public.events for select to authenticated using (public.is_staff());

-- Judges are blind (D-015): only admins see names and USNs. Judges get participant codes via judge_queue().
create policy participants_read on public.participants for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy submissions_read on public.submissions for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.participants p where p.id = participant_id and p.user_id = auth.uid())
  );

create policy versions_read on public.submission_versions for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.submissions s join public.participants p on p.id = s.participant_id
      where s.id = submission_id and p.user_id = auth.uid()
    )
  );

-- Judges see only their own scores; the admin sees all (D-015).
create policy scores_read on public.scores for select to authenticated
  using (judge_id = auth.uid() or public.is_admin());

-- AI judging is admin-only and never shown to judges or participants (D-011, D-015).
create policy ai_runs_read on public.ai_runs for select to authenticated using (public.is_admin());
create policy ai_scores_read on public.ai_scores for select to authenticated using (public.is_admin());

-- Results are admin-only until published; the public reads them through public_results() (T-07).
create policy results_read on public.results for select to authenticated using (public.is_admin());
create policy audit_read on public.audit_logs for select to authenticated using (public.is_admin());

-- ── Storage ──────────────────────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 10485760, array['image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Object path: events/<event_id>/<participant_id>/<uuid>.<png|jpg|pdf>
create function public.can_upload_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(p_name, '/');
  e public.events;
  p public.participants;
begin
  if auth.uid() is null or array_length(parts, 1) <> 4 or parts[1] <> 'events' then
    return false;
  end if;
  if parts[4] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|pdf)$' then
    return false;
  end if;
  select * into e from public.events where is_current;
  if e.id is null or parts[2] <> e.id::text or not public.upload_window_open(e) then
    return false;
  end if;
  select * into p from public.participants where event_id = e.id and user_id = auth.uid();
  if p.id is null or parts[3] <> p.id::text or p.rules_ack_at is null then
    return false;
  end if;
  if not e.allow_replacement and exists (select 1 from public.submissions s where s.participant_id = p.id) then
    return false;
  end if;
  return true;
end;
$$;

create function public.owns_object_path(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participants p
    where p.user_id = auth.uid()
      and p_name like 'events/' || p.event_id::text || '/' || p.id::text || '/%'
  )
$$;

create policy submissions_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.can_upload_object(name));

create policy submissions_read on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (public.is_staff() or public.owns_object_path(name)));
-- No update or delete policy: an uploaded file can't be overwritten or removed by a client (spec §10.5).
