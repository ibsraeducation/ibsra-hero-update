-- ============================================================================
-- Performance Analysis — core tables (build brief §9)
--
-- One table per record the module collects. Nothing derived is stored: every
-- figure a parent reads is computed from these rows at read time, so a number
-- and the evidence under it can never drift apart.
--
-- Row-level security is enabled on every table and no policy is created here.
-- With RLS on and no policy, the default is deny — which is the state these
-- tables should sit in until the auth model lands. The tables marked
-- ADMIN ONLY carry data that must never reach a parent or student client:
-- fees, asset returns, continue_intent and the individual peer ratings.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type perf_help_type    as enum ('P', 'J');           -- procedural | judgment
create type perf_asset_type   as enum ('client_project', 'course', 'game', 'template');
create type perf_asset_stage  as enum ('draft', 'building', 'review', 'live');
create type perf_session_status as enum ('held', 'cancelled');
create type perf_plan_status   as enum ('planned', 'delivered');
create type perf_proof_type    as enum ('image', 'video', 'link', 'text');
create type perf_area          as enum ('character', 'engagement', 'learning', 'portfolio', 'return');

-- ---------------------------------------------------------------------------
-- Course and student
-- ---------------------------------------------------------------------------

create table perf_course (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  -- Five skills, in display order: [{ "id": "...", "name": "..." }]
  skills            jsonb not null,
  -- Rung text 1–5.
  level_ladder      jsonb not null,
  confidence_ladder jsonb not null,
  created_at        timestamptz not null default now(),
  constraint perf_course_five_skills check (jsonb_array_length(skills) = 5)
);

create table perf_student (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  course_id                   uuid not null references perf_course (id),
  cohort_id                   uuid not null,
  mentor_id                   uuid not null,
  enrolled_at                 timestamptz not null,
  currency                    text not null default 'EGP',
  -- Locked baselines (§2.3). Once set, only an admin override with a logged
  -- reason may change them; the trigger below is what enforces that.
  level_start                 int,
  level_start_locked_at       timestamptz,
  confidence_start            numeric(3, 1),
  confidence_start_locked_at  timestamptz,
  created_at                  timestamptz not null default now(),
  constraint perf_student_level_start_range check (level_start between 1 and 5),
  constraint perf_student_confidence_start_range check (confidence_start between 1 and 5)
);

create index perf_student_cohort_idx on perf_student (cohort_id);

-- The plan we deliver against. Feeds the Delivered strip — our output, never
-- presented as the student's outcome.
create table perf_course_plan (
  course_id    uuid not null references perf_course (id) on delete cascade,
  topic_id     text not null,
  planned_week int  not null,
  status       perf_plan_status not null default 'planned',
  primary key (course_id, topic_id)
);

-- ---------------------------------------------------------------------------
-- Area 2 — showing up
-- ---------------------------------------------------------------------------

create table perf_session (
  id        uuid primary key default gen_random_uuid(),
  cohort_id uuid not null,
  held_at   timestamptz not null,
  status    perf_session_status not null default 'held'
);

create index perf_session_cohort_idx on perf_session (cohort_id, held_at);

create table perf_attendance (
  session_id uuid not null references perf_session (id) on delete cascade,
  student_id uuid not null references perf_student (id) on delete cascade,
  attended   boolean not null,
  logged_at  timestamptz not null default now(),
  primary key (session_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Area 1 and 3 — the work
-- ---------------------------------------------------------------------------

create table perf_project (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references perf_student (id) on delete cascade,
  title           text not null,
  -- Set at assignment and read-only at marking time: an easier project cannot
  -- claim a better independence score (§4 1.3).
  difficulty_tier int  not null check (difficulty_tier between 1 and 3),
  steps_total     int  not null check (steps_total > 0),
  assigned_at     timestamptz not null,
  due_at          timestamptz not null,
  delivered_at    timestamptz,
  mark            int check (mark between 0 and 100),
  revision_rounds int  not null default 0,
  reminders_sent  int  not null default 0
);

create index perf_project_student_idx on perf_project (student_id, due_at);

create table perf_help_log (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references perf_project (id) on delete cascade,
  step_no    int  not null,
  type       perf_help_type not null,
  logged_at  timestamptz not null default now(),
  mentor_id  uuid not null
);

create index perf_help_log_project_idx on perf_help_log (project_id);

create table perf_skill_score (
  student_id uuid not null references perf_student (id) on delete cascade,
  skill_id   text not null,
  score      int  not null check (score between 1 and 5),
  month      text not null,                     -- 2026-09
  mentor_id  uuid not null,
  -- True on the first monthly review only. The locked skill_start[] baseline.
  is_start   boolean not null default false,
  primary key (student_id, skill_id, month)
);

create table perf_level_change (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references perf_student (id) on delete cascade,
  level       int  not null check (level between 1 and 5),
  proposed_by uuid not null,
  -- A level above the previous one needs a second mentor. Null while pending.
  approved_by uuid,
  approved_at timestamptz,
  constraint perf_level_second_signature check (
    (approved_at is null) or (approved_by is not null and approved_by <> proposed_by))
);

create table perf_retention_test (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references perf_student (id) on delete cascade,
  skill_id   text not null,
  taught_at  timestamptz not null,
  tested_at  timestamptz not null,
  passed     boolean not null,
  -- §2.1: the skill has to have been taught at least six weeks before the test.
  constraint perf_retention_six_weeks check (tested_at >= taught_at + interval '42 days')
);

-- ---------------------------------------------------------------------------
-- Weekly and monthly inputs
-- ---------------------------------------------------------------------------

create table perf_weekly_pulse (
  student_id  uuid not null references perf_student (id) on delete cascade,
  week        text not null,                    -- 2026-W39
  mood        int check (mood between 1 and 5),
  pride       int check (pride between 1 and 5),
  -- Null means the week went unanswered. Silence is what admin is alerted to.
  answered_at timestamptz,
  primary key (student_id, week)
);

-- ADMIN ONLY. Individual rows are never exposed, in any view — a teamwork
-- figure is an average or it is nothing.
create table perf_peer_rating (
  rater_id uuid not null references perf_student (id) on delete cascade,
  ratee_id uuid not null references perf_student (id) on delete cascade,
  week     text not null,
  score    int  not null check (score between 1 and 5),
  primary key (rater_id, ratee_id, week),
  constraint perf_peer_not_self check (rater_id <> ratee_id)
);

create index perf_peer_rating_ratee_idx on perf_peer_rating (ratee_id, week);

create table perf_monthly_review (
  student_id         uuid not null references perf_student (id) on delete cascade,
  month              text not null,
  confidence_self    int check (confidence_self between 1 and 5),
  confidence_mentor  int check (confidence_mentor between 1 and 5),
  -- One observed moment. Required of the mentor alongside the rating.
  mentor_moment      text,
  -- ADMIN ONLY. A false opens a mentor task within 48h and a founder call.
  continue_intent    boolean,
  mentor_rating      int check (mentor_rating between 1 and 5),
  primary key (student_id, month),
  constraint perf_review_moment_required check (
    confidence_mentor is null or (mentor_moment is not null and length(trim(mentor_moment)) > 0))
);

create table perf_extra_work (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references perf_student (id) on delete cascade,
  artifact_path text not null,
  ts            timestamptz not null,
  hours         numeric(5, 2) not null check (hours > 0),
  verified      boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Area 4 and 5 — assets, return, money
-- ---------------------------------------------------------------------------

create table perf_benchmark_price (
  type        text primary key,
  price       numeric(12, 2) not null check (price >= 0),
  currency    text not null default 'EGP',
  -- Where the rate came from. Reviewed quarterly.
  source      text not null,
  reviewed_at timestamptz not null default now()
);

create table perf_asset (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references perf_student (id) on delete cascade,
  type            perf_asset_type not null,
  title           text not null,
  link            text,
  stage           perf_asset_stage not null default 'draft',
  pct_done        int not null default 0 check (pct_done between 0 and 100),
  ship_date       timestamptz,
  link_live       boolean not null default false,
  name_visible    boolean not null default false,
  -- No consent, no render. The read path filters on this before a client sees it.
  consent_on_file boolean not null default false,
  client_fee_paid numeric(12, 2),
  benchmark_type  text references perf_benchmark_price (type),
  mark            int check (mark between 0 and 100),
  outside_accepted boolean not null default false,
  accepted_by     text,
  mentor_hours    numeric(6, 2) not null default 0,
  tools_cost      numeric(12, 2) not null default 0
);

create index perf_asset_student_idx on perf_asset (student_id, stage);

-- ADMIN ONLY.
create table perf_asset_return (
  id       uuid primary key default gen_random_uuid(),
  asset_id uuid not null references perf_asset (id) on delete cascade,
  date     date not null,
  revenue  numeric(12, 2) not null default 0,
  units    int not null default 0,
  views    int not null default 0,
  source   text not null
);

create table perf_payment (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references perf_student (id) on delete cascade,
  asset_id     uuid references perf_asset (id) on delete set null,
  amount       numeric(12, 2) not null check (amount > 0),
  currency     text not null default 'EGP',
  paid_at      timestamptz not null,
  receipt_path text,
  -- Only a verified payment reaches the Return line.
  verified     boolean not null default false
);

create index perf_payment_student_idx on perf_payment (student_id, paid_at);

-- ADMIN ONLY. Never leaves the server for a family client.
create table perf_fee (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references perf_student (id) on delete cascade,
  amount     numeric(12, 2) not null,
  paid_at    timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Mentor note, proof, snapshot
-- ---------------------------------------------------------------------------

create table perf_mentor_note (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references perf_student (id) on delete cascade,
  mentor_id      uuid not null,
  -- ≤ 40 words, one concrete observation (§0 rule 4).
  text           text not null,
  focus_next     text not null,
  -- The card this note answers. Set when the card is red (§8).
  linked_card_id text,
  sent_at        timestamptz not null default now(),
  constraint perf_note_forty_words check (array_length(regexp_split_to_array(trim(text), '\s+'), 1) <= 40)
);

create index perf_mentor_note_student_idx on perf_mentor_note (student_id, sent_at desc);

create table perf_proof_item (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references perf_student (id) on delete cascade,
  area            perf_area not null,
  card_id         text not null,
  type            perf_proof_type not null,
  path            text not null,
  consent_on_file boolean not null default false,
  created_at      timestamptz not null default now()
);

create index perf_proof_student_idx on perf_proof_item (student_id, area, created_at desc);

create table perf_quarter_snapshot (
  student_id      uuid not null references perf_student (id) on delete cascade,
  quarter         text not null,                -- 2026-Q3
  portfolio_value numeric(12, 2) not null default 0,
  client_ready    int not null default 0,
  gaps            int not null default 0,
  level           int not null default 1,
  written_at      timestamptz not null default now(),
  primary key (student_id, quarter)
);

-- ---------------------------------------------------------------------------
-- Locked baselines (§2.3)
--
-- level_start locks at day 7, confidence_start at the end of month 1, and
-- skill_start[] at the first monthly review. After the lock the value is
-- read-only; an admin override sets perf.override_reason for the statement and
-- the change is written to perf_baseline_override.
-- ---------------------------------------------------------------------------

create table perf_baseline_override (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references perf_student (id) on delete cascade,
  field      text not null,
  old_value  text,
  new_value  text,
  reason     text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create or replace function perf_guard_locked_baselines() returns trigger
language plpgsql as $$
declare
  reason text := current_setting('perf.override_reason', true);
begin
  if old.level_start_locked_at is not null
     and new.level_start is distinct from old.level_start then
    if reason is null or length(trim(reason)) = 0 then
      raise exception 'level_start is locked; set perf.override_reason to change it';
    end if;
    insert into perf_baseline_override (student_id, field, old_value, new_value, reason)
    values (old.id, 'level_start', old.level_start::text, new.level_start::text, reason);
  end if;

  if old.confidence_start_locked_at is not null
     and new.confidence_start is distinct from old.confidence_start then
    if reason is null or length(trim(reason)) = 0 then
      raise exception 'confidence_start is locked; set perf.override_reason to change it';
    end if;
    insert into perf_baseline_override (student_id, field, old_value, new_value, reason)
    values (old.id, 'confidence_start', old.confidence_start::text, new.confidence_start::text, reason);
  end if;

  return new;
end;
$$;

create trigger perf_student_baseline_guard
  before update on perf_student
  for each row execute function perf_guard_locked_baselines();

create or replace function perf_guard_locked_skill_start() returns trigger
language plpgsql as $$
declare
  reason text := current_setting('perf.override_reason', true);
begin
  if old.is_start and new.score is distinct from old.score then
    if reason is null or length(trim(reason)) = 0 then
      raise exception 'skill_start is locked; set perf.override_reason to change it';
    end if;
    insert into perf_baseline_override (student_id, field, old_value, new_value, reason)
    values (old.student_id, 'skill_start:' || old.skill_id,
            old.score::text, new.score::text, reason);
  end if;
  return new;
end;
$$;

create trigger perf_skill_score_baseline_guard
  before update on perf_skill_score
  for each row execute function perf_guard_locked_skill_start();

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- On, with no policy: the default is deny for every client role. The read and
-- write policies land with the auth model, so that a parent policy can be
-- written against a real guardian → student link rather than a guess.
-- ---------------------------------------------------------------------------

alter table perf_course            enable row level security;
alter table perf_student           enable row level security;
alter table perf_course_plan       enable row level security;
alter table perf_session           enable row level security;
alter table perf_attendance        enable row level security;
alter table perf_project           enable row level security;
alter table perf_help_log          enable row level security;
alter table perf_skill_score       enable row level security;
alter table perf_level_change      enable row level security;
alter table perf_retention_test    enable row level security;
alter table perf_weekly_pulse      enable row level security;
alter table perf_peer_rating       enable row level security;
alter table perf_monthly_review    enable row level security;
alter table perf_extra_work        enable row level security;
alter table perf_benchmark_price   enable row level security;
alter table perf_asset             enable row level security;
alter table perf_asset_return      enable row level security;
alter table perf_payment           enable row level security;
alter table perf_fee               enable row level security;
alter table perf_mentor_note       enable row level security;
alter table perf_proof_item        enable row level security;
alter table perf_quarter_snapshot  enable row level security;
alter table perf_baseline_override enable row level security;
