-- ARTIFEX schema (TRD › Database). All writes go through security-definer RPCs (0003); clients only read
-- what RLS (0002) allows. Times are always the database clock (D-002).

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'judge')),
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'ARTIFEX' check (char_length(name) between 2 and 80),
  -- setup → live → closed (judging) → published. "live" auto-closes at deadline + grace (sync_current_event).
  status text not null default 'setup' check (status in ('setup', 'live', 'closed', 'published')),
  is_current boolean not null default true,
  registration_open boolean not null default false,
  -- 30 s minimum exists for bot tests; the event default is 10 minutes (D-004).
  duration_seconds int not null default 600 check (duration_seconds between 30 and 7200),
  grace_seconds int not null default 10 check (grace_seconds between 0 and 60),
  max_file_bytes bigint not null default 10485760 check (max_file_bytes between 1024 and 10485760),
  allow_replacement boolean not null default true,
  judging_mode text not null default 'manual' check (judging_mode in ('manual', 'ai')),
  ai_finalists int not null default 5 check (ai_finalists between 0 and 8),
  theme_title text not null default '' check (char_length(theme_title) <= 120),
  theme_brief text not null default '' check (char_length(theme_brief) <= 1000),
  started_at timestamptz,
  deadline_at timestamptz,
  closed_at timestamptz,
  published_at timestamptz,
  results_source text check (results_source in ('manual', 'ai')),
  results_computed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_live_has_times check (status = 'setup' or (started_at is not null and deadline_at is not null))
);
create unique index events_one_current on public.events (is_current) where is_current;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  name text not null check (char_length(name) between 2 and 60),
  usn text not null check (usn ~ '^[0-9A-Z]{6,12}$'),
  branch text not null default '' check (char_length(branch) <= 40),
  rules_ack_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id),
  unique (event_id, usn),
  unique (event_id, code)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  reference text not null unique,
  active_version_id uuid,
  version_count int not null default 0,
  first_received_at timestamptz not null,
  last_received_at timestamptz not null,
  unique (event_id, participant_id)
);

create table public.submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  version_number int not null check (version_number >= 1),
  storage_key text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 200),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'application/pdf')),
  file_size_bytes bigint not null check (file_size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- When storage finished receiving the file (storage.objects.created_at, server clock).
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (submission_id, version_number)
);
alter table public.submissions
  add constraint submissions_active_version_fk foreign key (active_version_id)
  references public.submission_versions (id) deferrable initially deferred;

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  judge_id uuid not null references auth.users (id) on delete cascade,
  theme int not null default 0 check (theme between 0 and 30),
  originality int not null default 0 check (originality between 0 and 25),
  hierarchy int not null default 0 check (hierarchy between 0 and 20),
  composition int not null default 0 check (composition between 0 and 15),
  message int not null default 0 check (message between 0 and 10),
  total int generated always as (theme + originality + hierarchy + composition + message) stored,
  comment text not null default '' check (char_length(comment) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (submission_id, judge_id)
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'cancelled', 'completed')),
  phase text not null default 'scoring' check (phase in ('scoring', 'finalists', 'done')),
  finalists int not null check (finalists >= 0),
  total int not null check (total >= 0),
  models_used text[] not null default '{}',
  started_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cancel_reason text
);
create unique index ai_runs_one_running on public.ai_runs (event_id) where status = 'running';

create table public.ai_scores (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_runs (id) on delete cascade,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  version_id uuid references public.submission_versions (id) on delete set null,
  status text not null check (status in ('ok', 'failed')),
  attempts int not null default 1,
  theme int check (theme between 0 and 30),
  originality int check (originality between 0 and 25),
  hierarchy int check (hierarchy between 0 and 20),
  composition int check (composition between 0 and 15),
  message int check (message between 0 and 10),
  total int generated always as (theme + originality + hierarchy + composition + message) stored,
  reasons jsonb not null default '{}',
  flags text[] not null default '{}',
  summary text not null default '' check (char_length(summary) <= 600),
  model text,
  error_code text,
  finalist_rank int,
  finalist_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, submission_id),
  constraint ai_scores_ok_complete check (
    status = 'failed'
    or (theme is not null and originality is not null and hierarchy is not null and composition is not null and message is not null)
  )
);

create table public.results (
  event_id uuid not null references public.events (id) on delete cascade,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  rank int not null check (rank >= 1),
  final_score numeric(6, 2) not null,
  source text not null check (source in ('manual', 'ai')),
  tie_break_note text not null default '',
  primary key (event_id, submission_id),
  unique (event_id, rank)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid references public.events (id) on delete set null,
  actor uuid,
  action text not null,
  target text,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index participants_event_idx on public.participants (event_id, created_at);
create index submissions_event_idx on public.submissions (event_id, first_received_at);
create index versions_submission_idx on public.submission_versions (submission_id, version_number desc);
create index scores_submission_idx on public.scores (submission_id, status);
create index ai_scores_run_idx on public.ai_scores (run_id, status);
create index results_event_idx on public.results (event_id, rank);
create index audit_event_idx on public.audit_logs (event_id, created_at desc);

-- The first event. "New event" (admin RPC) archives it and opens a fresh one.
insert into public.events (name) values ('ARTIFEX 2026');
