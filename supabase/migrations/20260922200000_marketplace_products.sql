-- ==========================================================================
-- The marketplace catalogue, on the server.
--
-- Listings existed already, but only in the admin's own browser: the store
-- held them, nothing ever sent them anywhere, and so a family could never be
-- shown one. This is the same shape, in a table — one row per thing that can
-- be bought, whether it is a training program or a kit.
--
-- A program listing points at the `tracks` row it sells, so its courses and
-- sessions are read off the real curriculum rather than typed in twice. A
-- kit points at nothing: it is a box, and `seats`/`seats_taken` are its
-- stock.
--
-- Who sees what is the whole point of `status`: the admin sees every row and
-- writes them; everybody else signed in sees the published ones and writes
-- none. A draft is therefore invisible to a family by construction, not by
-- the browser remembering to filter.
-- ==========================================================================

create type public.product_category as enum ('program', 'kit');
create type public.product_status   as enum ('draft', 'published', 'archived');
-- How the buyer receives it. A kit ships; everything else is taught.
create type public.delivery_mode    as enum ('online', 'onsite', 'hybrid', 'shipped');

create table public.products (
  -- Text, like tracks and loops: the browser makes `prd_…` ids so a listing
  -- can be built and referenced before it is ever saved.
  id            text primary key,
  category      public.product_category not null default 'program',
  name          text not null default '' check (char_length(name) <= 160),
  summary       text not null default '' check (char_length(summary) <= 600),
  status        public.product_status not null default 'draft',
  -- EGP. Null is "not decided yet" and is never rendered as free — that is
  -- the whole reason it is nullable rather than defaulting to 0.
  price_egp     integer check (price_egp is null or price_egp >= 0),
  -- What it sells, when it sells content. Losing the program must not lose
  -- the money record, so both are set null rather than cascading.
  track_id      text references public.tracks (id) on delete set null,
  loop_id       text references public.loops (id) on delete set null,
  instructor_id uuid references public.profiles (id) on delete set null,
  age_min       integer not null default 14 check (age_min between 0 and 120),
  age_max       integer not null default 22 check (age_max between 0 and 120),
  -- Seats for something taught, stock for a kit.
  seats         integer not null default 20 check (seats >= 0),
  seats_taken   integer not null default 0 check (seats_taken >= 0),
  start_date    timestamptz,
  end_date      timestamptz,
  duration      text not null default '' check (char_length(duration) <= 120),
  delivery      public.delivery_mode not null default 'online',
  location      text not null default '' check (char_length(location) <= 200),
  -- One line each: what the buyer actually gets.
  highlights    text[] not null default '{}',
  description   text not null default '' check (char_length(description) <= 12000),
  skill         text not null default '' check (char_length(skill) <= 160),
  price_per_course_egp integer check (price_per_course_egp is null or price_per_course_egp >= 0),
  installments  integer not null default 1 check (installments between 1 and 24),
  deposit_egp   integer not null default 0 check (deposit_egp >= 0),
  upfront_discount integer not null default 0 check (upfront_discount between 0 and 100),
  -- A URL or a CSS gradient; empty falls back to one mixed from `color`.
  thumbnail     text not null default '',
  -- Design token stem: brand · gold · teal · rose · sky.
  color         text not null default 'brand' check (char_length(color) <= 20),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index products_listed_idx on public.products (status, category, created_at desc);
create index products_track_idx  on public.products (track_id);
create index products_loop_idx   on public.products (loop_id);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------------ RLS

alter table public.products enable row level security;
revoke all on table public.products from anon;

-- A draft is not a listing. Everyone signed in reads what is published; the
-- admin reads everything, including the ones still being written.
create policy products_select on public.products for select to authenticated
  using ((select private.is_admin()) or status = 'published');

create policy products_write on public.products for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
