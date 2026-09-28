-- ==========================================================================
-- Files: session materials (uploaded by an admin) and students' uploaded
-- answers. Both buckets are private; files are opened with short-lived
-- signed URLs, and storage checks the policies below before signing one.
--
-- Paths:
--   materials:   <session_id>/<uuid>/<file name>        (Material.url = storage://materials/<path>)
--   submissions: <student uuid>/<session_id>/<task_id>/<uuid>-<file name>
-- ==========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('materials', 'materials', false, 52428800, array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip', 'application/x-zip-compressed',
    'application/json',
    'image/*',
    'text/*'
  ]),
  ('submissions', 'submissions', false, 26214400, array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip', 'application/x-zip-compressed',
    'image/*',
    'text/*'
  ])
on conflict (id) do nothing;

-- A material file is readable by an admin, or by a student enrolled in a
-- course whose released session lists that exact path. The path prefix is
-- not trusted: a duplicated session shares its files with the original.
create or replace function private.can_read_material(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1
    from public.session_files f
    join public.sessions s on s.id = f.session_id
    where f.path = p_path
      and s.loop_id in (select private.my_loop_ids())
      and private.session_released(s.status, s.type, s.scheduled_at)
  )
$$;
revoke all on function private.can_read_material(text) from public, anon;
grant execute on function private.can_read_material(text) to authenticated;

create or replace function private.is_active_student()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'student' and not p.disabled
  )
$$;
revoke all on function private.is_active_student() from public, anon;
grant execute on function private.is_active_student() to authenticated;

-- One permissive policy per command.
create policy "ibsra files read" on storage.objects
  for select to authenticated
  using (
    (bucket_id = 'materials' and private.can_read_material(name))
    or (bucket_id = 'submissions'
        and ((storage.foldername(name))[1] = (select auth.uid())::text
             or (select private.is_admin())))
  );

create policy "ibsra files insert" on storage.objects
  for insert to authenticated
  with check (
    (bucket_id = 'materials' and (select private.is_admin()))
    or (bucket_id = 'submissions'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and (select private.is_active_student()))
  );

create policy "ibsra files update" on storage.objects
  for update to authenticated
  using (bucket_id in ('materials', 'submissions') and (select private.is_admin()))
  with check (bucket_id in ('materials', 'submissions') and (select private.is_admin()));

create policy "ibsra files delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('materials', 'submissions') and (select private.is_admin()));
