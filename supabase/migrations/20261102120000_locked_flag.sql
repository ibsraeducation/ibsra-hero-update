-- The admin's lock on a program and on a course. A locked one stays in
-- Material but cannot be opened by a student or a family.
alter table public.tracks add column if not exists locked boolean not null default false;
alter table public.loops  add column if not exists locked boolean not null default false;
