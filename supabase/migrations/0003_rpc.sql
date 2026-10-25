-- ARTIFEX RPCs (TRD › APIs). Every function checks the caller's role and the event state, uses the database
-- clock, and raises an error code (UPPER_SNAKE) that src/lib/errors.ts turns into a readable message.

-- ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────

create function public._audit(p_event uuid, p_action text, p_target text, p_reason text, p_meta jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (event_id, actor, action, target, reason, metadata)
  values (p_event, auth.uid(), p_action, p_target, p_reason, coalesce(p_meta, '{}'))
$$;

create function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
end;
$$;

create function public._require_staff() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_staff() then raise exception 'NOT_STAFF'; end if;
end;
$$;

create function public._reason(p_reason text) returns text
language plpgsql immutable as $$
declare r text := btrim(coalesce(p_reason, ''));
begin
  if char_length(r) < 3 or char_length(r) > 200 then raise exception 'REASON_REQUIRED'; end if;
  return r;
end;
$$;

-- Lazily closes a live round once deadline + grace has passed, so the closing time is exact even when nobody
-- presses a button. Every RPC that depends on the round state calls this first.
create function public.sync_current_event() returns public.events
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  update public.events
     set status = 'closed', closed_at = deadline_at, updated_at = now()
   where is_current and status = 'live' and now() > deadline_at + make_interval(secs => grace_seconds)
  returning * into e;
  if e.id is not null then
    perform public._audit(e.id, 'round.closed', null, 'deadline reached', jsonb_build_object('deadline_at', e.deadline_at));
    return e;
  end if;
  select * into e from public.events where is_current;
  if e.id is null then raise exception 'NO_EVENT'; end if;
  return e;
end;
$$;

-- What anyone may know about the event. The theme stays hidden until the round starts (spec §7.2).
create function public._public_event(e public.events) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'status', e.status,
    'registration_open', e.registration_open,
    'duration_seconds', e.duration_seconds,
    'grace_seconds', e.grace_seconds,
    'max_file_bytes', e.max_file_bytes,
    'allow_replacement', e.allow_replacement,
    'started_at', e.started_at,
    'deadline_at', e.deadline_at,
    'closed_at', e.closed_at,
    'published', e.status = 'published',
    'theme_title', case when e.status = 'setup' then null else e.theme_title end,
    'theme_brief', case when e.status = 'setup' then null else e.theme_brief end
  )
$$;

create function public._receipt(s public.submissions, v public.submission_versions) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'reference', s.reference,
    'version', v.version_number,
    'version_count', s.version_count,
    'received_at', v.received_at,
    'filename', v.original_filename,
    'size', v.file_size_bytes,
    'mime_type', v.mime_type,
    'sha256', v.sha256
  )
$$;

-- ── Public (anon) ────────────────────────────────────────────────────────────────────────────────────────

create function public.public_board() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.events := public.sync_current_event();
begin
  return jsonb_build_object(
    'server_now', now(),
    'event', public._public_event(e),
    'counts', jsonb_build_object(
      'registered', (select count(*) from public.participants where event_id = e.id),
      'submitted', (select count(*) from public.submissions where event_id = e.id and active_version_id is not null)
    )
  );
end;
$$;

-- Published results only: rank, code, name, score. Never USN, comments, AI data or the judging mode (D-011, D-012).
create function public.public_results() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.events := public.sync_current_event();
begin
  if e.status <> 'published' then
    return jsonb_build_object('published', false, 'event_name', e.name, 'rows', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'published', true,
    'event_name', e.name,
    'theme_title', e.theme_title,
    'published_at', e.published_at,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('rank', r.rank, 'code', p.code, 'name', p.name, 'score', r.final_score) order by r.rank)
      from public.results r join public.participants p on p.id = r.participant_id
      where r.event_id = e.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ── Participant ──────────────────────────────────────────────────────────────────────────────────────────

create function public.register_participant(p_name text, p_usn text, p_branch text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  p public.participants;
  v_usn text := upper(regexp_replace(coalesce(p_usn, ''), '\s', '', 'g'));
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_branch text := regexp_replace(btrim(coalesce(p_branch, '')), '\s+', ' ', 'g');
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if public.is_staff() then raise exception 'STAFF_CANNOT_REGISTER'; end if;
  perform public.sync_current_event();
  -- Locks the event row so participant codes are assigned one at a time.
  select * into e from public.events where is_current for update;

  select * into p from public.participants where event_id = e.id and user_id = auth.uid();
  if p.id is not null then
    return to_jsonb(p) - 'user_id';
  end if;

  if not e.registration_open or e.status in ('closed', 'published') then raise exception 'REGISTRATION_CLOSED'; end if;
  if v_usn !~ '^[0-9A-Z]{6,12}$' or v_name !~ '^[A-Za-z][A-Za-z .''-]{1,59}$'
     or char_length(v_branch) > 40 or v_branch !~ '^[A-Za-z0-9 &.,()/-]*$' then
    raise exception 'VALIDATION';
  end if;
  -- The account email is <usn>@participants.artifex.app (D-003): nobody can register someone else's USN.
  if v_email <> lower(v_usn) || '@participants.artifex.app' then raise exception 'USN_MISMATCH'; end if;
  if exists (select 1 from public.participants where event_id = e.id and usn = v_usn) then
    raise exception 'DUPLICATE_USN';
  end if;

  insert into public.participants (event_id, user_id, code, name, usn, branch)
  values (
    e.id, auth.uid(),
    'AFX-' || lpad(((select count(*) from public.participants where event_id = e.id) + 1)::text, 3, '0'),
    v_name, v_usn, v_branch
  )
  returning * into p;
  return to_jsonb(p) - 'user_id';
end;
$$;

create function public.acknowledge_rules() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.participants;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.participants set rules_ack_at = coalesce(rules_ack_at, now())
   where event_id = public.current_event_id() and user_id = auth.uid()
  returning * into p;
  if p.id is null then raise exception 'NOT_REGISTERED'; end if;
  return jsonb_build_object('rules_ack_at', p.rules_ack_at);
end;
$$;

create function public.my_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.events := public.sync_current_event();
  p public.participants;
  s public.submissions;
  v public.submission_versions;
  versions jsonb := '[]';
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into p from public.participants where event_id = e.id and user_id = auth.uid();
  if p.id is not null then
    select * into s from public.submissions where participant_id = p.id;
    if s.id is not null then
      select * into v from public.submission_versions where id = s.active_version_id;
      select coalesce(jsonb_agg(jsonb_build_object(
               'version', x.version_number, 'filename', x.original_filename, 'received_at', x.received_at,
               'size', x.file_size_bytes, 'active', x.id = s.active_version_id) order by x.version_number desc), '[]')
        into versions from public.submission_versions x where x.submission_id = s.id;
    end if;
  end if;
  return jsonb_build_object(
    'server_now', now(),
    'event', public._public_event(e),
    'participant', case when p.id is null then null else jsonb_build_object(
      'id', p.id, 'code', p.code, 'name', p.name, 'usn', p.usn, 'branch', p.branch, 'rules_ack_at', p.rules_ack_at) end,
    'submission', case when s.id is null then null else public._receipt(s, v) || jsonb_build_object('versions', versions) end,
    'upload_open', p.id is not null and p.rules_ack_at is not null and public.upload_window_open(e)
      and (e.allow_replacement or s.id is null),
    'upload_closes_at', case when e.deadline_at is null then null
      else e.deadline_at + make_interval(secs => e.grace_seconds) end
  );
end;
$$;

-- Called by /api/submissions/finalize (after it checks the file's magic bytes and hashes it) with the
-- participant's own session. The file's size, type and arrival time come from storage, not the client.
create function public.finalize_submission(p_path text, p_filename text, p_sha256 text) returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare
  e public.events := public.sync_current_event();
  p public.participants;
  s public.submissions;
  v public.submission_versions;
  o record;
  v_size bigint;
  v_mime text;
  v_name text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- Serialises one participant's finalisations (double clicks, retries).
  select * into p from public.participants where event_id = e.id and user_id = auth.uid() for update;
  if p.id is null then raise exception 'NOT_REGISTERED'; end if;
  if p.rules_ack_at is null then raise exception 'RULES_NOT_ACKNOWLEDGED'; end if;
  if p_path is null or p_path not like 'events/' || e.id::text || '/' || p.id::text || '/%' then
    raise exception 'BAD_PATH';
  end if;

  -- Idempotent: finalising the same upload again returns the same receipt.
  select v2.* into v from public.submission_versions v2 where v2.storage_key = p_path;
  if v.id is not null then
    select * into s from public.submissions where id = v.submission_id;
    return public._receipt(s, v);
  end if;

  select so.created_at, so.metadata into o
    from storage.objects so
   where so.bucket_id = 'submissions' and so.name = p_path and so.owner_id = auth.uid()::text;
  if o.created_at is null then raise exception 'UPLOAD_MISSING'; end if;

  -- D-005: the file must have been fully received by deadline + grace. Finalising may lag a little behind
  -- the upload (the route sniffs and hashes first), so it gets 60 s more, but the received time decides.
  if e.status not in ('live', 'closed') or e.deadline_at is null
     or o.created_at > e.deadline_at + make_interval(secs => e.grace_seconds)
     or now() > e.deadline_at + make_interval(secs => e.grace_seconds + 60) then
    perform public._audit(e.id, 'submission.rejected_late', p.code, null, jsonb_build_object('path', p_path));
    raise exception 'SUBMISSIONS_CLOSED';
  end if;

  v_size := coalesce((o.metadata ->> 'size')::bigint, 0);
  v_mime := lower(coalesce(o.metadata ->> 'mimetype', ''));
  if v_size <= 0 then raise exception 'EMPTY_FILE'; end if;
  if v_size > e.max_file_bytes then raise exception 'FILE_TOO_LARGE'; end if;
  if v_mime not in ('image/png', 'image/jpeg', 'application/pdf') then raise exception 'UNSUPPORTED_FILE'; end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then raise exception 'VALIDATION'; end if;

  -- The original name is display metadata only (spec §10.4): strip paths and control characters.
  v_name := regexp_replace(regexp_replace(coalesce(p_filename, ''), '^.*[\\/]', ''), '[[:cntrl:]<>"]', '', 'g');
  v_name := left(btrim(v_name), 200);
  if v_name = '' then v_name := 'design'; end if;

  select * into s from public.submissions where participant_id = p.id;
  if s.id is not null and not e.allow_replacement then raise exception 'REPLACEMENT_NOT_ALLOWED'; end if;
  if s.id is null then
    insert into public.submissions (event_id, participant_id, reference, first_received_at, last_received_at)
    values (e.id, p.id, 'R-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), o.created_at, o.created_at)
    returning * into s;
  end if;

  insert into public.submission_versions
    (submission_id, version_number, storage_key, original_filename, mime_type, file_size_bytes, sha256, received_at)
  values (s.id, s.version_count + 1, p_path, v_name, v_mime, v_size, p_sha256, o.created_at)
  returning * into v;

  update public.submissions
     set active_version_id = v.id, version_count = v.version_number, last_received_at = o.created_at
   where id = s.id
  returning * into s;

  perform public._audit(e.id, case when v.version_number = 1 then 'submission.accepted' else 'submission.replaced' end,
    p.code, null, jsonb_build_object('reference', s.reference, 'version', v.version_number, 'size', v_size, 'mime', v_mime));
  return public._receipt(s, v);
end;
$$;

-- ── Admin: event control ─────────────────────────────────────────────────────────────────────────────────

create function public.admin_event() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  perform public._require_staff();
  e := public.sync_current_event();
  return to_jsonb(e) || jsonb_build_object('server_now', now());
end;
$$;

create function public.update_event_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  locked_keys text[] := array['theme_title', 'theme_brief', 'duration_seconds', 'grace_seconds', 'max_file_bytes'];
  k text;
begin
  perform public._require_admin();
  perform public.sync_current_event();
  select * into e from public.events where is_current for update;
  for k in select jsonb_object_keys(p) loop
    if k not in ('name', 'theme_title', 'theme_brief', 'duration_seconds', 'grace_seconds', 'max_file_bytes',
                 'allow_replacement', 'judging_mode', 'ai_finalists') then
      raise exception 'VALIDATION';
    end if;
    -- Theme and timing can't change once participants have seen them (spec §16 "Theme edited after start").
    if k = any(locked_keys) and e.status <> 'setup' then raise exception 'THEME_LOCKED'; end if;
  end loop;
  if e.status = 'published' then raise exception 'EVENT_PUBLISHED'; end if;

  begin
    update public.events set
      name = coalesce(btrim(p ->> 'name'), name),
      theme_title = coalesce(btrim(p ->> 'theme_title'), theme_title),
      theme_brief = coalesce(btrim(p ->> 'theme_brief'), theme_brief),
      duration_seconds = coalesce((p ->> 'duration_seconds')::int, duration_seconds),
      grace_seconds = coalesce((p ->> 'grace_seconds')::int, grace_seconds),
      max_file_bytes = coalesce((p ->> 'max_file_bytes')::bigint, max_file_bytes),
      allow_replacement = coalesce((p ->> 'allow_replacement')::boolean, allow_replacement),
      judging_mode = coalesce(p ->> 'judging_mode', judging_mode),
      ai_finalists = coalesce((p ->> 'ai_finalists')::int, ai_finalists),
      updated_at = now()
    where id = e.id
    returning * into e;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'VALIDATION';
  end;
  perform public._audit(e.id, 'event.settings', null, null, jsonb_build_object('keys', (select jsonb_agg(x) from jsonb_object_keys(p) x)));
  return to_jsonb(e);
end;
$$;

create function public.set_registration(p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  perform public._require_admin();
  e := public.sync_current_event();
  if e.status in ('closed', 'published') and p_open then raise exception 'INVALID_TRANSITION'; end if;
  update public.events set registration_open = p_open, updated_at = now() where id = e.id returning * into e;
  perform public._audit(e.id, case when p_open then 'registration.opened' else 'registration.closed' end, null, null, '{}');
  return to_jsonb(e);
end;
$$;

create function public.start_round() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  perform public._require_admin();
  select * into e from public.events where is_current for update;
  -- A double click finds the round already live: INVALID_TRANSITION, never a second start (spec §21).
  if e.status <> 'setup' then raise exception 'INVALID_TRANSITION'; end if;
  if btrim(e.theme_title) = '' then raise exception 'NO_THEME'; end if;
  update public.events
     set status = 'live', started_at = now(), deadline_at = now() + make_interval(secs => duration_seconds), updated_at = now()
   where id = e.id
  returning * into e;
  perform public._audit(e.id, 'round.started', null, null, jsonb_build_object(
    'deadline_at', e.deadline_at, 'duration_seconds', e.duration_seconds,
    'participants', (select count(*) from public.participants where event_id = e.id)));
  return to_jsonb(e);
end;
$$;

create function public.extend_round(p_seconds int, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  old_deadline timestamptz;
  r text;
begin
  perform public._require_admin();
  r := public._reason(p_reason);
  perform public.sync_current_event();
  select * into e from public.events where is_current for update;
  if e.status <> 'live' then raise exception 'ROUND_NOT_LIVE'; end if;
  if p_seconds is null or p_seconds < 10 or p_seconds > 1800 then raise exception 'VALIDATION'; end if;
  old_deadline := e.deadline_at;
  update public.events set deadline_at = deadline_at + make_interval(secs => p_seconds), updated_at = now()
   where id = e.id returning * into e;
  perform public._audit(e.id, 'round.extended', null, r,
    jsonb_build_object('old_deadline', old_deadline, 'new_deadline', e.deadline_at, 'seconds', p_seconds));
  return to_jsonb(e);
end;
$$;

-- Ends the round now. Uploads already in flight still get the grace period, then the round closes.
create function public.end_round(p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  old_deadline timestamptz;
  r text;
begin
  perform public._require_admin();
  r := public._reason(p_reason);
  perform public.sync_current_event();
  select * into e from public.events where is_current for update;
  if e.status <> 'live' then raise exception 'ROUND_NOT_LIVE'; end if;
  old_deadline := e.deadline_at;
  update public.events set deadline_at = least(deadline_at, now()), updated_at = now() where id = e.id returning * into e;
  perform public._audit(e.id, 'round.ended_early', null, r, jsonb_build_object('old_deadline', old_deadline, 'new_deadline', e.deadline_at));
  return to_jsonb(e);
end;
$$;

-- Archives the current event (kept with its results) and opens a fresh one in setup.
create function public.new_event(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  n public.events;
begin
  perform public._require_admin();
  e := public.sync_current_event();
  if e.status = 'live' then raise exception 'INVALID_TRANSITION'; end if;
  update public.events set is_current = false, updated_at = now() where id = e.id;
  insert into public.events (name, created_by) values (coalesce(nullif(btrim(p_name), ''), e.name), auth.uid()) returning * into n;
  perform public._audit(n.id, 'event.created', null, null, jsonb_build_object('previous_event', e.id));
  return to_jsonb(n);
end;
$$;

-- ── Judging: manual ──────────────────────────────────────────────────────────────────────────────────────

create function public.save_score(
  p_submission uuid, p_theme int, p_originality int, p_hierarchy int, p_composition int, p_message int,
  p_comment text, p_submit boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  sc public.scores;
begin
  perform public._require_staff();
  e := public.sync_current_event();
  if e.status <> 'closed' then raise exception 'JUDGING_NOT_OPEN'; end if;
  if not exists (select 1 from public.submissions where id = p_submission and event_id = e.id and active_version_id is not null) then
    raise exception 'NOT_FOUND';
  end if;
  if char_length(coalesce(p_comment, '')) > 1000 then raise exception 'VALIDATION'; end if;
  begin
    insert into public.scores (submission_id, judge_id, theme, originality, hierarchy, composition, message, comment, status, submitted_at)
    values (p_submission, auth.uid(), p_theme, p_originality, p_hierarchy, p_composition, p_message, coalesce(p_comment, ''),
            case when p_submit then 'submitted' else 'draft' end, case when p_submit then now() end)
    on conflict (submission_id, judge_id) do update set
      theme = excluded.theme, originality = excluded.originality, hierarchy = excluded.hierarchy,
      composition = excluded.composition, message = excluded.message, comment = excluded.comment,
      status = case when p_submit then 'submitted' else public.scores.status end,
      submitted_at = case when p_submit then now() else public.scores.submitted_at end,
      updated_at = now()
    returning * into sc;
  exception when check_violation or not_null_violation then
    raise exception 'VALIDATION';
  end;
  if p_submit then
    perform public._audit(e.id, 'score.submitted', p_submission::text, null, jsonb_build_object('total', sc.total));
  end if;
  return to_jsonb(sc);
end;
$$;

-- Everything a judge needs, blind: participant code (never name or USN), the active file and their own score.
create function public.judge_queue() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  perform public._require_staff();
  e := public.sync_current_event();
  return jsonb_build_object('server_now', now(), 'status', e.status, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'submission_id', s.id, 'code', p.code, 'storage_key', v.storage_key, 'mime_type', v.mime_type,
      'version', v.version_number, 'received_at', v.received_at, 'size', v.file_size_bytes,
      'my_score', (select to_jsonb(sc) - 'judge_id' from public.scores sc where sc.submission_id = s.id and sc.judge_id = auth.uid()),
      'submitted_scores', (select count(*) from public.scores sc where sc.submission_id = s.id and sc.status = 'submitted')
    ) order by p.code)
    from public.submissions s
    join public.participants p on p.id = s.participant_id
    join public.submission_versions v on v.id = s.active_version_id
    where s.event_id = e.id
  ), '[]'::jsonb));
end;
$$;

-- ── Judging: AI (Gemini) ─────────────────────────────────────────────────────────────────────────────────
-- The admin's browser drives the run one step at a time through /api/ai/step (D-009). These RPCs keep the
-- run's state; the route only talks to Gemini. A cancelled run accepts nothing more.

create function public.start_ai_run() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  r public.ai_runs;
  n int;
begin
  perform public._require_admin();
  e := public.sync_current_event();
  if e.status <> 'closed' then raise exception 'JUDGING_NOT_OPEN'; end if;
  if exists (select 1 from public.ai_runs where event_id = e.id and status = 'running') then raise exception 'AI_RUN_ACTIVE'; end if;
  select count(*) into n from public.submissions where event_id = e.id and active_version_id is not null;
  if n = 0 then raise exception 'NO_SUBMISSIONS'; end if;
  insert into public.ai_runs (event_id, finalists, total, started_by)
  values (e.id, case when least(e.ai_finalists, n) >= 2 then least(e.ai_finalists, n) else 0 end, n, auth.uid())
  returning * into r;
  update public.events set judging_mode = 'ai', updated_at = now() where id = e.id;
  perform public._audit(e.id, 'ai.run_started', r.id::text, null, jsonb_build_object('total', n, 'finalists', r.finalists));
  return to_jsonb(r);
end;
$$;

-- Ranking order shared by finalist selection and results (D-012).
create function public._ai_ranked(p_run uuid)
returns table (submission_id uuid, version_id uuid, storage_key text, mime_type text, file_size_bytes bigint,
               total int, finalist_rank int, theme int, originality int, hierarchy int, first_received_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.submission_id, v.id, v.storage_key, v.mime_type, v.file_size_bytes, a.total, a.finalist_rank,
         a.theme, a.originality, a.hierarchy, s.first_received_at
    from public.ai_scores a
    join public.submissions s on s.id = a.submission_id
    join public.submission_versions v on v.id = s.active_version_id
   where a.run_id = p_run and a.status = 'ok'
   order by a.total desc, a.theme desc, a.originality desc, a.hierarchy desc, s.first_received_at asc
$$;

create function public.ai_next(p_run uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.ai_runs;
  item record;
  ok_count int;
begin
  perform public._require_admin();
  select * into r from public.ai_runs where id = p_run for update;
  if r.id is null then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'running' then return jsonb_build_object('state', r.status); end if;

  if r.phase = 'scoring' then
    select s.id as submission_id, v.id as version_id, v.storage_key, v.mime_type, v.file_size_bytes
      into item
      from public.submissions s
      join public.submission_versions v on v.id = s.active_version_id
      left join public.ai_scores a on a.run_id = r.id and a.submission_id = s.id
     where s.event_id = r.event_id
       and (a.id is null or (a.status = 'failed' and a.attempts < 3))
     order by a.attempts nulls first, s.first_received_at
     limit 1;
    if found then
      return jsonb_build_object('state', 'score', 'submission_id', item.submission_id, 'version_id', item.version_id,
        'storage_key', item.storage_key, 'mime_type', item.mime_type, 'size', item.file_size_bytes);
    end if;
    select count(*) into ok_count from public.ai_scores where run_id = r.id and status = 'ok';
    if r.finalists >= 2 and ok_count >= 2 then
      update public.ai_runs set phase = 'finalists' where id = r.id returning * into r;
    else
      update public.ai_runs set status = 'completed', phase = 'done', finished_at = now() where id = r.id returning * into r;
      perform public._audit(r.event_id, 'ai.run_completed', r.id::text, null, jsonb_build_object('finalists', 0));
      return jsonb_build_object('state', 'completed');
    end if;
  end if;

  if r.phase = 'finalists' then
    return jsonb_build_object('state', 'finalists', 'items', (
      select jsonb_agg(jsonb_build_object('submission_id', x.submission_id, 'storage_key', x.storage_key,
                                          'mime_type', x.mime_type, 'size', x.file_size_bytes))
        from (select * from public._ai_ranked(r.id) limit r.finalists) x));
  end if;
  return jsonb_build_object('state', r.status);
end;
$$;

create function public.record_ai_score(
  p_run uuid, p_submission uuid, p_version uuid, p_scores jsonb, p_reasons jsonb, p_flags text[], p_summary text, p_model text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.ai_runs;
begin
  perform public._require_admin();
  select * into r from public.ai_runs where id = p_run for update;
  if r.id is null then raise exception 'NOT_FOUND'; end if;
  -- Gemini may answer after the admin cancelled: the answer is discarded.
  if r.status <> 'running' or r.phase <> 'scoring' then return jsonb_build_object('recorded', false, 'state', r.status); end if;
  if not exists (select 1 from public.submissions where id = p_submission and event_id = r.event_id) then raise exception 'NOT_FOUND'; end if;
  begin
    insert into public.ai_scores (run_id, submission_id, version_id, status, theme, originality, hierarchy, composition, message,
                                  reasons, flags, summary, model)
    values (r.id, p_submission, p_version, 'ok',
            (p_scores ->> 'theme')::int, (p_scores ->> 'originality')::int, (p_scores ->> 'hierarchy')::int,
            (p_scores ->> 'composition')::int, (p_scores ->> 'message')::int,
            coalesce(p_reasons, '{}'), coalesce(p_flags, '{}'), left(coalesce(p_summary, ''), 600), p_model)
    on conflict (run_id, submission_id) do update set
      status = 'ok', version_id = excluded.version_id, theme = excluded.theme, originality = excluded.originality,
      hierarchy = excluded.hierarchy, composition = excluded.composition, message = excluded.message,
      reasons = excluded.reasons, flags = excluded.flags, summary = excluded.summary, model = excluded.model,
      error_code = null, updated_at = now();
  exception when check_violation or not_null_violation or invalid_text_representation then
    raise exception 'VALIDATION';
  end;
  update public.ai_runs set models_used = (select array_agg(distinct m) from unnest(models_used || p_model) m) where id = r.id;
  return jsonb_build_object('recorded', true, 'state', 'running');
end;
$$;

create function public.record_ai_failure(p_run uuid, p_submission uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.ai_runs;
begin
  perform public._require_admin();
  select * into r from public.ai_runs where id = p_run for update;
  if r.id is null then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'running' then return jsonb_build_object('recorded', false, 'state', r.status); end if;
  insert into public.ai_scores (run_id, submission_id, status, error_code)
  values (r.id, p_submission, 'failed', left(p_code, 40))
  on conflict (run_id, submission_id) do update
    set attempts = public.ai_scores.attempts + 1, error_code = excluded.error_code, updated_at = now()
    where public.ai_scores.status = 'failed';
  return jsonb_build_object('recorded', true, 'state', 'running');
end;
$$;

-- p_order lists the finalists best first; an empty array completes the run without a finalist order
-- (used when the comparison keeps failing: rubric totals still rank everyone).
create function public.record_ai_finalists(p_run uuid, p_order uuid[], p_notes text[], p_model text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.ai_runs;
  expected uuid[];
  i int;
begin
  perform public._require_admin();
  select * into r from public.ai_runs where id = p_run for update;
  if r.id is null then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'running' or r.phase <> 'finalists' then return jsonb_build_object('recorded', false, 'state', r.status); end if;
  if coalesce(array_length(p_order, 1), 0) > 0 then
    select array_agg(x.submission_id) into expected from (select * from public._ai_ranked(r.id) limit r.finalists) x;
    if array_length(p_order, 1) <> array_length(expected, 1)
       or exists (select unnest(p_order) except select unnest(expected))
       or (select count(distinct x) from unnest(p_order) x) <> array_length(expected, 1) then
      raise exception 'VALIDATION';
    end if;
    for i in 1 .. array_length(p_order, 1) loop
      update public.ai_scores set finalist_rank = i, finalist_note = left(coalesce(p_notes[i], ''), 300), updated_at = now()
       where run_id = r.id and submission_id = p_order[i];
    end loop;
    update public.ai_runs set models_used = (select array_agg(distinct m) from unnest(models_used || p_model) m) where id = r.id;
  end if;
  update public.ai_runs set status = 'completed', phase = 'done', finished_at = now() where id = r.id returning * into r;
  perform public._audit(r.event_id, 'ai.run_completed', r.id::text, null,
    jsonb_build_object('finalists', coalesce(array_length(p_order, 1), 0)));
  return jsonb_build_object('recorded', true, 'state', 'completed');
end;
$$;

create function public.cancel_ai_run(p_run uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.ai_runs;
begin
  perform public._require_admin();
  update public.ai_runs set status = 'cancelled', finished_at = now(), cancel_reason = left(coalesce(btrim(p_reason), ''), 200)
   where id = p_run and status = 'running'
  returning * into r;
  if r.id is null then raise exception 'AI_RUN_NOT_RUNNING'; end if;
  perform public._audit(r.event_id, 'ai.run_cancelled', r.id::text, r.cancel_reason, '{}');
  return to_jsonb(r);
end;
$$;

-- ── Results ──────────────────────────────────────────────────────────────────────────────────────────────

-- One row per judged submission with the score the chosen source gives it (D-012).
create function public._scored(p_event uuid, p_source text, p_run uuid)
returns table (submission_id uuid, participant_id uuid, first_received_at timestamptz, total numeric, theme numeric,
               originality numeric, hierarchy numeric, finalist_rank int, fallback boolean)
language sql stable security definer set search_path = public as $$
  with manual as (
    select sc.submission_id, avg(sc.total) as total, avg(sc.theme) as theme, avg(sc.originality) as originality,
           avg(sc.hierarchy) as hierarchy
      from public.scores sc where sc.status = 'submitted' group by sc.submission_id
  ), ai as (
    select a.submission_id, a.total::numeric as total, a.theme::numeric as theme, a.originality::numeric as originality,
           a.hierarchy::numeric as hierarchy, a.finalist_rank
      from public.ai_scores a where a.run_id = p_run and a.status = 'ok'
  )
  select s.id, s.participant_id, s.first_received_at,
         -- AI mode falls back to the manual score for a design the AI couldn't read.
         coalesce(case when p_source = 'ai' then ai.total end, m.total),
         coalesce(case when p_source = 'ai' then ai.theme end, m.theme),
         coalesce(case when p_source = 'ai' then ai.originality end, m.originality),
         coalesce(case when p_source = 'ai' then ai.hierarchy end, m.hierarchy),
         case when p_source = 'ai' then ai.finalist_rank end,
         (p_source = 'ai' and ai.submission_id is null)
    from public.submissions s
    left join manual m on m.submission_id = s.id
    left join ai on ai.submission_id = s.id
   where s.event_id = p_event and s.active_version_id is not null
$$;

create function public.compute_results(p_source text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  v_run uuid;
  rec record;
  has_prev boolean := false;
  prev_total numeric;
  prev_theme numeric;
  prev_originality numeric;
  prev_hierarchy numeric;
  prev_finalist boolean;
  n int := 0;
  note text;
begin
  perform public._require_admin();
  e := public.sync_current_event();
  if e.status <> 'closed' then raise exception 'JUDGING_NOT_OPEN'; end if;
  if p_source is null or p_source not in ('manual', 'ai') then raise exception 'VALIDATION'; end if;
  if exists (select 1 from public.ai_runs where event_id = e.id and status = 'running') then raise exception 'AI_RUN_ACTIVE'; end if;

  if p_source = 'ai' then
    select id into v_run from public.ai_runs where event_id = e.id and status = 'completed' order by finished_at desc limit 1;
    if v_run is null then raise exception 'NO_AI_RESULTS'; end if;
  end if;

  if not exists (select 1 from public._scored(e.id, p_source, v_run)) then raise exception 'NO_SUBMISSIONS'; end if;
  if exists (select 1 from public._scored(e.id, p_source, v_run) x where x.total is null) then raise exception 'MISSING_SCORES'; end if;

  delete from public.results where event_id = e.id;
  for rec in
    select * from public._scored(e.id, p_source, v_run) x
     -- Ranks always follow the score (D-017). The AI finalist comparison only breaks a tie between finalists.
     order by x.total desc, x.finalist_rank nulls last, x.theme desc, x.originality desc, x.hierarchy desc, x.first_received_at asc
  loop
    n := n + 1;
    note := '';
    if has_prev and round(prev_total, 2) = round(rec.total, 2) then
      note := case
        when prev_finalist and rec.finalist_rank is not null then 'Tie on score: decided by finalist comparison'
        when prev_theme <> rec.theme then 'Tie on score: decided by theme'
        when prev_originality <> rec.originality then 'Tie on score: decided by originality'
        when prev_hierarchy <> rec.hierarchy then 'Tie on score: decided by hierarchy'
        else 'Tie on score: decided by earlier submission' end;
    end if;
    if rec.fallback then note := btrim(note || ' · manual score (AI could not read the file)', ' ·'); end if;
    insert into public.results (event_id, submission_id, participant_id, rank, final_score, source, tie_break_note)
    values (e.id, rec.submission_id, rec.participant_id, n, round(rec.total, 2), p_source, note);
    has_prev := true;
    prev_total := rec.total;
    prev_theme := rec.theme;
    prev_originality := rec.originality;
    prev_hierarchy := rec.hierarchy;
    prev_finalist := rec.finalist_rank is not null;
  end loop;

  update public.events set results_source = p_source, results_computed_at = now(), updated_at = now() where id = e.id;
  perform public._audit(e.id, 'results.computed', null, null, jsonb_build_object('source', p_source, 'count', n, 'ai_run', v_run));
  return jsonb_build_object('count', n, 'source', p_source);
end;
$$;

create function public.publish_results() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  perform public._require_admin();
  e := public.sync_current_event();
  if e.status <> 'closed' then raise exception 'INVALID_TRANSITION'; end if;
  if not exists (select 1 from public.results where event_id = e.id) then raise exception 'NO_RESULTS'; end if;
  if exists (select 1 from public.ai_runs where event_id = e.id and status = 'running') then raise exception 'AI_RUN_ACTIVE'; end if;
  update public.events set status = 'published', published_at = now(), registration_open = false, updated_at = now()
   where id = e.id returning * into e;
  perform public._audit(e.id, 'results.published', null, null,
    jsonb_build_object('source', e.results_source, 'count', (select count(*) from public.results where event_id = e.id)));
  return to_jsonb(e);
end;
$$;

create function public.unpublish_results(p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  r text;
begin
  perform public._require_admin();
  r := public._reason(p_reason);
  e := public.sync_current_event();
  if e.status <> 'published' then raise exception 'INVALID_TRANSITION'; end if;
  update public.events set status = 'closed', published_at = null, updated_at = now() where id = e.id returning * into e;
  perform public._audit(e.id, 'results.unpublished', null, r, '{}');
  return to_jsonb(e);
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────────────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.staff_role(), public.is_admin(), public.is_staff(), public.current_event_id(),
  public.upload_window_open(public.events), public.can_upload_object(text), public.owns_object_path(text)
  to authenticated;

grant execute on function public.public_board(), public.public_results() to anon, authenticated;

grant execute on function
  public.register_participant(text, text, text), public.acknowledge_rules(), public.my_status(),
  public.finalize_submission(text, text, text),
  public.admin_event(), public.update_event_settings(jsonb), public.set_registration(boolean),
  public.start_round(), public.extend_round(int, text), public.end_round(text), public.new_event(text),
  public.save_score(uuid, int, int, int, int, int, text, boolean), public.judge_queue(),
  public.start_ai_run(), public.ai_next(uuid), public.record_ai_score(uuid, uuid, uuid, jsonb, jsonb, text[], text, text),
  public.record_ai_failure(uuid, uuid, text), public.record_ai_finalists(uuid, uuid[], text[], text),
  public.cancel_ai_run(uuid, text),
  public.compute_results(text), public.publish_results(), public.unpublish_results(text)
  to authenticated;
