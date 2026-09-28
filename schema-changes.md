# Dev schema changes

Applied directly to the dev database, newest at the bottom. One clean
migration gets generated from this file on "prepare for deploy".

> Note: the first block below was authored as
> `supabase/migrations/20260925090000_lectures_and_sections.sql` and applied
> via `apply_migration` *before* the dev-mode rules landed, so it is also
> recorded in the remote `supabase_migrations.schema_migrations` table as
> four entries (`lectures_and_sections_schema`,
> `lectures_and_sections_plan_rules`,
> `lectures_and_sections_suggestions_and_request`,
> `answer_request_books_the_week`). The file has been removed from
> `supabase/migrations/`; its content is reproduced here. Regenerating a
> clean migration later should account for those four history rows.

---

## 1. Lectures and sections (applied 2026-09-23)

The weekly rhythm: a lecture is a two-hour sitting where material is taught,
a section is the short (≤1h) sitting on each of the other days.

### Extensions
- `btree_gist` — created in schema `extensions`. Needed for the exclusion
  constraint below, which mixes an `=` on a uuid with a `&&` on a range.

### `public.availability_windows`
| change | detail |
|---|---|
| **+ column** | `kind text not null default 'lecture'` |
| **+ check** | `availability_windows_kind` — `kind in ('lecture','section')` |
| **+ check** | `availability_windows_kind_length` — a lecture is exactly `end_min - start_min = 120`; a section is `between 15 and 60` |
| **+ index** | `availability_windows_kind_idx (kind, weekday) where active` |

### `public.tracks`
| change | detail |
|---|---|
| **+ column** | `lectures_per_week smallint not null default 1` |
| **+ check** | `tracks_lectures_per_week` — `between 1 and 2` |
| **+ comment** | on the column |

### `public.session_bookings`
| change | detail |
|---|---|
| **+ column** | `kind text not null default 'lecture'` |
| **+ check** | `session_bookings_kind` — `kind in ('lecture','section')` |
| **+ column** | `ends_at timestamptz not null` (backfilled, then set not null) |
| **+ trigger** | `session_bookings_ends_at` BEFORE INSERT OR UPDATE OF `starts_at`, `duration_min` → `private.booking_ends_at()` |
| **− index** | `session_bookings_one_per_slot_idx` dropped — it only caught an identical start time |
| **+ constraint** | `session_bookings_no_overlap` — `exclude using gist (student_id with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelled')` |

`ends_at` is a stored column rather than an expression because
`timestamptz + interval` is only STABLE (it reads the session TimeZone) and
so cannot appear in an index expression. `tstzrange(a, b)` over two plain
columns is immutable.

### New table `public.request_slots`
```
request_id uuid not null references access_requests (id) on delete cascade
window_id  uuid not null references availability_windows (id) on delete cascade
primary key (request_id, window_id)
```
RLS on. Policies: `request_slots_select` (the admin, the parent who asked,
or the student it is for) and `request_slots_admin` (all, admin only).
Deliberately **no** insert policy for parents — see `request_with_times`.

### Functions
| function | note |
|---|---|
| `private.booking_ends_at()` | trigger fn, keeps `ends_at` |
| `private.weekday_name(int)` | immutable, 0 = Sunday |
| `private.busy_grid(uuid)` | a student's future bookings flattened onto a Cairo week as `(weekday, start_min, end_min)` |
| `private.section_weekdays(text)` | which weekdays a program actually publishes a section on |
| `private.check_plan(uuid, text, uuid[])` | the gate: right number of lectures, on distinct days, no section on a lecture day, one section a day, a section on every other teaching day, and nothing overlapping the student's calendar or the rest of the chosen week. Raises a sentence a parent can act on |
| `public.suggest_windows(uuid, text, text, int)` | security definer. Windows this student could actually take, with `seats_left`. Caller must be the admin, the student, or their parent |
| `public.request_with_times(uuid, text, text, text, uuid[])` | security definer. Validates via `check_plan`, then writes `access_requests` + `request_slots` in one transaction |
| `public.answer_request(uuid, boolean, text[], text, uuid[])` | **signature changed**: `p_window uuid` → `p_windows uuid[]`. Old 5-arg `(uuid, boolean, text[], text, uuid)` **dropped** (PostgREST resolves by argument name; two overloads taking four named args are ambiguous). Books every window in the week, not one |

Grants: `suggest_windows`, `request_with_times`, `answer_request` execute to
`authenticated`, revoked from `public`/`anon`. The `private.*` helpers are
revoked from `public`/`anon`.

---

## 2. Per-course timeslots, day-less sections, batches (applied 2026-09-23)

Round two. Timeslots move from the program to the course, the admin sizes a
lecture himself, a section stops carrying a weekday, and "batch" becomes a
real table.

### `public.availability_windows`
| change | detail |
|---|---|
| **~ check** | `availability_windows_kind_length` replaced — a lecture is now `between 30 and 360` minutes (was: exactly 120); a section stays `between 15 and 60` |
| **~ column** | `weekday` is now **nullable** |
| **+ check** | `availability_windows_weekday_by_kind` — a lecture must have a weekday, a section must have `null` (it is offered daily; the family picks the day) |
| **+ check** | `availability_windows_on_a_course` — `loop_id is not null`, added **`NOT VALID`** |
| **+ index** | `availability_windows_loop_kind_idx (loop_id, kind, weekday) where active` |

> The `NOT VALID` is deliberate: one pre-existing test row (`28951cae-…`)
> names neither a program nor a course and cannot be migrated. It is exempt
> and unreachable — every query filters on `loop_id`. Delete it from the UI
> and the constraint can be `VALIDATE`d. A generated migration on a fresh
> database should create this constraint **without** `NOT VALID`.

### `public.loops`
| change | detail |
|---|---|
| **+ column** | `lectures_per_week smallint not null default 1` |
| **+ check** | `loops_lectures_per_week` — `between 1 and 2` |

### `public.tracks`
| change | detail |
|---|---|
| **− column** | `lectures_per_week` **dropped** (and its check) — it moved to the course, so there is one source of truth rather than two |

### `public.request_slots`
| change | detail |
|---|---|
| **+ column** | `weekday smallint` — the day a day-less section was chosen for; `null` for a lecture, which carries its own |
| **+ check** | `request_slots_weekday_range` |
| **~ key** | primary key `(request_id, window_id)` dropped; surrogate `id uuid` primary key added |
| **+ index** | unique `request_slots_one_idx (request_id, window_id, coalesce(weekday, -1))` — the same 17:00 section may be taken on Monday *and* Wednesday, which the old key forbade |

### New table `public.course_batches`
```
id uuid pk · loop_id text -> loops · name text · starts_on date
status text ('forming'|'running'|'done') · seats int · note text
created_at · updated_at   + set_updated_at trigger
```
Indexes: `(loop_id, starts_on desc)`, unique `(loop_id, lower(name))`.
RLS on: `course_batches_select` readable by any authenticated user (a family
sees the batch name on their calendar); `course_batches_write` admin only.

### `public.session_bookings` / `public.access_requests`
| change | detail |
|---|---|
| **+ column** | `session_bookings.batch_id uuid -> course_batches on delete set null` + index `(batch_id, starts_at)` |
| **+ column** | `access_requests.batch_id uuid -> course_batches on delete set null` |

### Functions
| function | note |
|---|---|
| `private.expand_window(uuid, **int**, date, date, int)` | **signature changed** — takes the weekday to use for a day-less section. Old 4-arg dropped |
| `public.window_occurrences(uuid, **int**, int)` | **signature changed** to match. Old 2-arg dropped |
| `private.section_weekdays(text)` | **dropped** — sections no longer have publishable days |
| `private.resolve_plan(text, jsonb)` | **new**. The chosen week resolved to `(window, kind, weekday, start, end)`. A set-returning function, not a temp table, so `check_plan` stays STABLE |
| `private.check_plan(uuid, **text**, **jsonb**)` | **signature changed** — now `(student, loop, slots)`. Slots are `[{"w": uuid, "d": weekday\|null}]`, one jsonb array rather than two parallel arrays that must stay the same length |
| `public.suggest_windows(uuid, **text**, text, int)` | **signature changed** — per course, and clash-checks a day-less section against the day being considered |
| `public.window_grid(date, date)` | **new**, admin only. Published availability as real dates, for the calendar. Sections expand onto every day; returns `taken` per occurrence |
| `public.request_with_times(uuid, **text**, text, **jsonb**)` | **signature changed** — `(student, loop, note, slots)`. The program is derived from the course |
| `public.answer_request(uuid, boolean, text[], text, **jsonb**, **uuid**)` | **signature changed** — `p_windows uuid[]` → `p_slots jsonb`, plus `p_batch uuid`. Books into a batch |

---

## 3. The admin assigns students to times (applied 2026-09-23)

Round three, and a reversal of round two's premise. Families no longer pick
times at all: the admin agrees a time with a parent off the platform and
puts the hero into it here. Nothing is dropped — the weekly rules still
exist and still run — but the door they guard moved.

### No table changes
This round is functions only. `request_slots` and `check_plan` stay: a
request may still carry a week, and it is still validated if it does. The
frontend simply stops sending one.

### Functions
| function | note |
|---|---|
| `public.assign_to_window(uuid, uuid, int, uuid)` | **new**, admin only. Puts one student into one window for the whole run of its course. A lecture uses its own weekday; a day-less section takes the `p_weekday` given. Refuses, in a sentence, when the hero is already booked at that hour (checked against `busy_grid`) or when the window is full (`capacity`). Writes the `times_set` notification to the student and their parent. Returns how many sittings were written |
| `public.unassign_from_window(uuid, uuid)` | **new**, admin only. Cancels that student's *future* sittings in that window — a sitting already taught is a record, not a plan. Returns how many were cancelled |
| `public.window_roster(uuid)` | **new**, admin only. Every student enrolled in the window's course, with `assigned` and `sittings` per row — "who is in this, and who else is there", which are two lists that only make sense beside each other |
| `public.request_with_times(uuid, text, text, jsonb)` | **changed**: an empty `p_slots` is now the normal shape of a request rather than an error. `check_plan` runs only when slots are actually supplied, so the rules still hold for anything that does arrive with times. `window_id` is no longer set on the request |

### Frontend consequence worth recording
`src/components/schedule/WeekPlanner.tsx` was **deleted** — it implemented
the family-picks-a-week flow and had zero references after this round.
`weekPlanner.css` is kept: the parent-facing "we will call you about the
times" notice still uses `.wp-none`. `public.suggest_windows` is kept on the
server and as a typed wrapper, unused by the UI for now — it is the query an
admin-side "which times could this hero take" helper would want.

---

## 4. Confirmation names the times (applied 2026-09-23)

The enrolment journey, joined up. A parent asks for a course with no times;
the admin agrees them with the family off-platform and writes them down in
the same action that confirms. Functions only — no table changes.

### Functions
| function | note |
|---|---|
| `private.describe_week(jsonb)` | **new**. Turns a slot array into the sentence a family reads: `Lecture Sunday 17:00-19:30 · Sections 17:00-18:00 on Monday, Tuesday, …`. Returns `''` for an empty week |
| `public.answer_request(uuid, boolean, text[], text, jsonb, uuid)` | **changed** (same signature). The approval notifications now carry the actual times via `describe_week` instead of a bare count, and the parent's title reads "… is confirmed for …" rather than "… is open for …". Everything else — enrolment, bookings, batch — is unchanged |

---

## 5. What a program covers (applied 2026-09-23)

### `public.tracks`
| change | detail |
|---|---|
| **+ column** | `overview text not null default ''` — what the program covers, as a Markdown outline, written on the program form and read on the enrolment dialog's first step |
| **+ check** | `tracks_overview_check` — `char_length(overview) <= 20000`, matching `loops_overview_check` |
| **+ comment** | on the column |

`tracks.price_egp` is **left in place** but is no longer written by any form:
the "Price for a family" field was removed from the program form, and
nothing displays a program price to families. Drop the column if you want it
gone — nothing reads it.

---

## 5. First subscription at enrolment, direct transfers, days not months (applied 2026-09-23)

Reverses the "one door wallet" rule (`20260924100000_one_door_wallet.sql`):
a family may again pay a subscription **directly** by InstaPay / Vodafone
Cash, as well as from the wallet. Only **monthly (30 days)** and
**quarterly (90 days)** are sold; half-yearly and annual stay in the enum
for old rows but no function will sell them.

### No table changes
The `payments_insert` policy is unchanged (parents still insert only
top-ups directly). A direct subscription transfer goes through the new
security-definer RPC instead.

### Functions
| function | note |
|---|---|
| `public.plan_days(pay_plan)` | **new**, immutable. monthly 30 · quarterly 90 · half_annual 180 · annual 365. Replaces `plan_months` in every writer (`plan_months` is left in place, unused) |
| `private.plan_price(pay_plan)` | **new**. The price of a plan *if it is sold* (monthly/quarterly, priced, switched on), else null |
| `private.extend_subscription(uuid, pay_plan)` | **new**. `paid_through = greatest(paid_through, today) + plan_days`. Returns the new date. The one place a countdown is started or extended |
| `public.file_subscription_payment(uuid, pay_plan, pay_method, int, text, text, text)` | **new**, parent only. `(student, plan, method, amount, proof_path, sender_ref, note)`. Checks the child is theirs, the plan is sold, the method is instapay/vodafone_cash, amount > 0, the proof path is in the parent's own folder, and that no subscription payment for that student is already pending. Inserts a pending `kind='program'` payment |
| `public.pay_from_wallet(uuid, pay_plan, text, text)` | **changed** (same signature). Uses `plan_price` / `extend_subscription` (days). Notifies the admins (`payment_wallet`) |
| `public.approve_payment(uuid, text)` | **changed** (same signature). Days via `extend_subscription`. Notifies the parent (`payment_approved`) — the new paid-through date for a subscription, "wallet charged" for a top-up |
| `public.reject_payment(uuid, text)` | **changed** (same signature). A **blank reason is refused**. Notifies the parent (`payment_rejected`) with the reason |
| `private.notify_payment_filed()` + trigger `payments_notify_filed` | **new**. `after insert on payments when status = 'pending'` → a `payment_filed` notification to every active admin (top-ups and direct transfers) |

Grants: `file_subscription_payment` and `plan_days` execute to
`authenticated`; the `private.*` helpers are revoked from `public`/`anon`.

---

## 6. Admin can upload payment QR codes (applied 2026-09-23)

`uploadQr` uploads with `upsert: true`, and Storage reads the object back
when it writes it, so a bucket with insert/update/delete policies but **no
SELECT policy** refused every upload ("You don't have permission").

### Storage policies
| change | detail |
|---|---|
| **+ policy** | `ibsra pay qr read` on `storage.objects` — `for select to authenticated using (bucket_id = 'pay-qr' and private.is_admin())`. Families still load the QR through the bucket's public URL, which does not go through RLS |

---

## 7. Student wallets, students paying for themselves, admin credits anyone (applied 2026-09-23)

Every parent **and every student** has a wallet. A student charges it,
pays a subscription (wallet or direct transfer) and enrols themself, with
the same flow a parent uses. The admin can credit any parent's or
student's wallet, and the owner is notified.

### No table changes — column meaning widened
| column | now means |
|---|---|
| `wallets.parent_id`, `wallet_entries.parent_id` | the wallet **owner** — a parent or a student |
| `payments.parent_id` | **who paid / filed** it — a parent, or a student paying for themself |
| `access_requests.parent_id` | who is answered: the student's first guardian when a student asks for themself, or the student when they have none |

### Helpers (new)
| function | note |
|---|---|
| `private.is_payer()` | signed-in, not disabled, role `parent` or `student` |
| `private.can_pay_for(uuid)` | the student is one of my children, or is me (a student) |
| `private.area_of(uuid)` | `'/parent'`, `'/student'` or `'/admin'` — where a notification links |

### Functions changed (same signatures)
| function | change |
|---|---|
| `file_subscription_payment`, `pay_from_wallet`, `buy_kit_from_wallet` | `is_parent()` → `is_payer()`, `my_children()` check → `can_pay_for()` |
| `approve_payment`, `reject_payment` | notification links use `area_of(payer)` instead of `/parent/…` |
| `request_with_times` | a student may ask for themself; filed under their guardian if they have one |
| `answer_request` | its notification links use `area_of(asker)` instead of `/parent/…` |
| `admin_credit_wallet(p_parent, …)` | accepts a parent **or a student** (param name kept), and writes a `wallet_credited` notification to the owner |

### Policies
| policy | change |
|---|---|
| `payments_insert` | top-ups allowed for `is_payer()` (was `is_parent()`) |
| `payments_select` | adds `student_id = auth.uid()` — a student sees what was paid for them |
| `access_requests_select` | adds `student_id = auth.uid()` |
| storage `ibsra pay proofs insert` | `is_payer()` (was `is_parent()`) |

### Data
`pay_accounts.instructions` and `pay_accounts.instapay_handle` cleared —
the "What else the family should know" note and the InstaPay address were
taken out of the admin form (InstaPay is a link + QR now).

---

## 8. Program length calculator at enrolment (applied 2026-09-23)

The enrol dialog no longer asks which course to start with. It asks for
the weekly rhythm instead — 2-hour lectures a week (learn) and section
length (execute projects) — and shows how long the program runs from the
program's total hours. See `src/lib/programLength.ts` (5 teaching days a
week; sections fill the days without a lecture).

### Columns
| table | change |
|---|---|
| `tracks` | **+** `total_hours integer` — check `1..5000`, null = not set. Set on the admin program form |
| `access_requests` | **+** `lectures_per_week smallint` (1–3) and `section_minutes smallint` (30/60/90/120), both nullable — the rhythm the family asked for, shown on Admin → Requests |

### Functions
| function | note |
|---|---|
| `public.request_with_times(uuid, text, text, jsonb, smallint, smallint)` | **signature changed** — adds `p_lectures`, `p_section_min` (both default null). The old 4-arg form is **dropped** (PostgREST would find the two ambiguous). The request is filed for the program's first course |

---

## 9. Course hours replace program hours (applied 2026-09-23)

The program length a family sees is the **sum of its courses' hours**
divided by the hours a week they pick, so the hours live on the course.

| table | change |
|---|---|
| `loops` | **+** `duration_hours integer` — check `1..2000`, null = not set. Set on the admin course form |
| `tracks` | **−** `total_hours` dropped (added in §8, never held data) |

The calculator shows a length only when **every** course of the program has
hours — a partial sum would promise a program shorter than it is.

---

## 10. A video per tab (applied 2026-09-23)

"What it covers" and "Values & skills" are tabs a family reads while a video
plays above them. Each tab can now carry its own video; a tab with none
falls back to the program's `video_url`.

| table | change |
|---|---|
| `tracks` | **+** `tab_videos jsonb not null default '{}'` + check `pg_column_size <= 8000` |
| `loops` | the same |

Shape: `{"covers": ["url", ...], "lists": {"technical": "url", ...}}`.
`covers` pairs with the "what it covers" tabs **by position** — the admin
editor writes the document and this array together, so they cannot drift.
`lists` is keyed by the seven fixed values-and-skills keys.

The bullets themselves stay in `overview` / the seven list columns: a link
is not something to read, so it is stored beside the text rather than inside
it (which would also have made `skillsFromLists` read a URL as a skill).

---

## 11. The enrol request says why it was refused (applied 2026-09-23)

A family asking twice hit the partial unique index
`access_requests_one_open_idx (student_id, track_id, loop_id) where status =
'pending'`, whose 23505 the client renders as the generic "That already
exists." — true, and useless.

`public.request_with_times(uuid, text, text, jsonb, smallint, smallint)`
(same signature) now checks the same rules before inserting and raises
`22023`, which the client passes through verbatim:

| case | what the family reads |
|---|---|
| already enrolled in that course | `<name> is already enrolled in <course>. It is open on their Missions page.` |
| a pending request for that course | `You already asked for <course> for <name>. The admin is looking at it and you will get a notification when they answer.` |
| a pending request for the whole program | `You already asked for the whole <program> for <name>, which includes this course. The admin is looking at it.` |

The index stays as the last word in a race; these checks exist to explain
rather than to enforce.

---

## 12. Notifications are realtime (applied 2026-09-23)

```
alter publication supabase_realtime add table public.notifications;
```

The only table in the publication. The client opens one channel per signed-in
reader, filtered `recipient_id=eq.<uid>` (`watchNotifications` in
`src/lib/api/notifications.ts`); replication honours the same RLS as a read,
so a channel only carries rows that person could have fetched anyway. A slow
poll (120 s, plus on focus) stays underneath it for a dropped socket.

---

## 13. Accepting the payment opens the program (applied 2026-09-23)

A family enrolled, paid, the admin accepted — and nothing opened. The
payment carried a plan and no program (`track_id` was always null), so
`approve_payment` started the countdown and fell through both of its
enrolment branches. The program only ever appeared if the admin *also*
answered the access request, which is a second act nobody was told about.

**`public.file_subscription_payment`** gained a last argument, so the old
seven-argument signature was dropped and replaced:

```
file_subscription_payment(uuid, pay_plan, pay_method, int, text, text, text, p_track text default null)
```

It records `track_id` and names the payment after the program
("Discovery Education Program", not "Quarterly subscription"), which is
also what the parent's Payments table promises in its Program column.

**`private.open_program(student, track, loop, actor)`** is the one place
enrolments are written — one row per course of the program, or the single
course — so the payment paths and `answer_request` cannot drift.

**`private.announce_program(parent, student, track, tail)`** writes the two
notices that were missing: the parent's, linking to `/parent/material`, and
the student's, linking to `/student/missions`.

**`public.approve_payment`** now opens the program and announces it. A
payment filed before it carried one falls back to the family's oldest
pending request, so rows already in the table still work. Its parent notice
drops the stale `?tab=history`.

**`public.pay_from_wallet`** stopped refusing a program and does the same
work inline — it is approved on the spot, so nothing else would ever open it.
It still refuses a single `p_loop`: courses are not sold on their own.

The access request stays pending on purpose. Paying opens the material;
the admin still answers the request to agree the session times, which is
the only thing that writes `session_bookings`. Because paying now opens
the courses, the enrol dialog files the request *before* it pays — the ask
is refused for a course the hero is already enrolled in.

---

## 14. Families enrol from Material (applied 2026-09-23)

The training path moved from the parent's Marketplace into Material: a
dimmed program opens the enrol dialog, a bright one opens the program. The
parent's Marketplace is kits only.

`public.answer_request` (same signature): the "not this time" notice sent
on a declined request now links to `<area>/material` instead of
`<area>/marketplace`, since that is where the family would ask again. It
was rewritten in place from its own definition with that one link swapped.

---

## 15. Booking the week the family picked (applied 2026-09-23)

After accepting a payment the admin goes straight to that family's request
(`/admin/requests?answer=<id>`) to set the times. Two rules stopped that
matching what the family chose at enrolment:

**`private.check_plan`** (same signature) required exactly the course's
own `lectures_per_week`. It now takes the number the family picked — the
pending request's `lectures_per_week` — and falls back to the course's
figure only when there is none.

**`availability_windows_kind_length`**: a section window was capped at 60
minutes while the enrol dialog offers 30 / 60 / 90 / 120. The cap is now
120, so every length a family can pick can be published and booked:

```
alter table public.availability_windows drop constraint availability_windows_kind_length;
alter table public.availability_windows add constraint availability_windows_kind_length check (
  case kind
    when 'lecture' then (end_min - start_min) between 30 and 360
    when 'section' then (end_min - start_min) between 15 and 120
    else null
  end);
```

**`public.answer_request`** (same signature): the notices read as the
schedule, not as a second "it is open" — the parent's is
`Times set for <hero> · <program>`, the student's `Your times for
<program>`. Both still carry the week and link to their calendar.

Tested in a rolled-back transaction: 2 lectures a week on a course whose
default is 1, 120-minute sections, 18 lectures + 45 sections booked, the
parent and student notified with links to `/parent/calendar` and
`/student/calendar`.

---

## 16. The admin types each student's week (applied 2026-09-23)

§15 had the admin pick from published availability slots. That is not the
workflow: after accepting a payment the admin is asked for **this
student's** schedule and types it in. Published slots are no longer needed,
and the dummy ones seeded for testing were deleted (56 rows, `note =
'dummy data'`) — they filled the admin calendar with "Open" entries.

**`public.schedule_student(p_request uuid, p_lecture_days int[],
p_lecture_start int, p_lecture_min int = 120, p_section_start int = null,
p_section_min int = null, p_from date = null, p_to date = null,
p_meeting text = null, p_note text = null) returns access_requests`**
— admin only; `execute` granted to `authenticated` only.

- Needs a pending request and a live subscription (accept the payment first).
- Books a lecture on every chosen weekday and, when a stand-up time is
  given, a section on every other day, from `p_from` (default: the course
  start, never before today) to `p_to` (default: the course end), in
  Africa/Cairo time. `session_bookings.window_id` is left null — nothing is
  published.
- A clash with the student's existing bookings (the `no_overlap` exclusion
  constraint) comes back as one sentence.
- Opens the program (`private.open_program`), answers the request, and
  notifies the parent (`<area>/calendar`) and the student
  (`/student/calendar`) with the week in words, e.g. "Lectures Sunday,
  Tuesday 16:00–18:00 · Stand-up 18:30–20:30 on the other days · from 23
  Sep to 24 Nov 2026."

Tested on a real pending request in a rolled-back transaction: 18 lectures
and 45 stand-ups booked at the right Cairo times, both notices written.

## 17. A hero's identity, and the registration list (applied 2026-09-24)

A family now says who a program is for *inside* the enrolment, and may add
the hero there and then. That hero is a real person the mentor has to place
and reach, so the record carries what identifies them.

**`public.profiles` gains five columns**, all nullable so every existing row
stays valid:

| column | what it holds |
| --- | --- |
| `national_id` | the 14-digit Egyptian national ID |
| `whatsapp` | the number the mentor reaches the family on |
| `first_name`, `second_name`, `last_name` | the name in the three parts it was typed in (`name` stays the joined one the platform shows) |

- `profiles_national_id_check` — `national_id is null or national_id ~ '^[0-9]{14}$'`.
- `profiles_national_id_key` — unique partial index, so one ID is one person.

The ID carries the birth date, so `age` is **read out of it** rather than
asked for twice: `parent-users` derives it in `add_child` and `update_child`
(century digit 2/3/4 → 1900s/2000s/2100s, then `yymmdd`). The check digit is
not verified — the published algorithm is not guaranteed, and a wrong
refusal on a real child's ID costs more than a typo the admin catches. The
same rule is in `src/lib/nationalId.ts` for the client, with tests.

A duplicate ID comes back as `national_id_taken`, not a constraint name.

**`public.program_registrations`** — a view, `security_invoker = true`, so
RLS decides who sees what (an admin every row, a parent their own). It is
the request joined to both people and the program:

`id, created_at, status, parent_id, parent_name, parent_email, parent_phone,
student_id, student_name, student_national_id, student_whatsapp,
student_age, track_id, program_name, loop_id, course_name,
lectures_per_week, section_minutes, answered_at`

`select` granted to `authenticated`. This is what Admin → Registrations
reads, and `lectures_per_week` / `section_minutes` are the family's
availability — what the schedule dialog (§16) opens pre-filled with.

A student reading the view sees nothing, even their own row: the join to
their parent's profile is blocked by `profiles_select`, which only lets them
read their own. That is the right answer — the list is the admin's, and the
parent's — but it is a join, not a policy, so it is written down here.

## 18. The week itself, not a rhythm (applied 2026-09-24)

Until now a family said *how many* lectures a week and *how long* a section
was, and the admin invented the days and the clock times afterwards. The
enrolment form now asks the real question — which of the hours the admin has
opened do you want, and when are you free on each of the other days — and
the answer is carried all the way to the bookings.

**`public.access_requests.schedule_ask jsonb`** — nullable. The week as the
family described it:

```json
{ "lectures": [{ "day": 0, "start": 960, "min": 120 }],
  "sections": [{ "day": 1, "start": 1110, "min": 60 }, …] }
```

`day` is 0 (Sunday) to 6, `start` is minutes after midnight **Cairo**, `min`
is how long the sitting runs. Null on every row filed before this, which
still carries only `lectures_per_week` / `section_minutes`. Nothing reads
the old columns in preference to this one: `availabilityLine` in
`src/lib/programLength.ts` says the week when it is there and falls back to
the counts when it is not.

**`private.ask_slots(jsonb, text)`** — one kind of sitting out of that
shape, keeping only rows that describe a real hour (weekday 0–6, start
inside the day, length 15 minutes to 6 hours, finishing before midnight).
**`private.clean_ask(jsonb)`** runs both kinds through it and returns null
when no lecture survives — a week with no lecture is not a week.

**`public.request_with_times`** gained `p_ask jsonb`. The old signature was
dropped rather than overloaded, so PostgREST has one function to resolve.
It stores `clean_ask(p_ask)` and **derives** `lectures_per_week` (the count)
and `section_minutes` (the shortest section) from it rather than trusting
the browser's copy — a row can no longer say "2 lectures a week" beside a
week holding three. When no ask is sent the two parameters are used as
before.

**`public.schedule_student`** gained `p_plan jsonb`, the same shape. When it
is given, each sitting is booked on its own day at its own hour, which is
what lets a family have Sunday at four and Wednesday at six. When it is not,
the old scalar arguments (`p_lecture_days`, `p_lecture_start`,
`p_section_start`, …) are folded into exactly that shape first, so there is
one code path that books. A section overlapping a lecture on the same day is
refused. `p_lecture_days` and `p_lecture_start` are now nullable, since a
plan supplies them.

**`private.plan_sentence(jsonb, date, date)`** writes the week into the
notification the parent and the hero read — "Lectures Sunday 16:00–18:00 ·
Sections 18:30–19:30 on Monday, Tuesday · from 05 Oct to 20 Dec 2026." It
says the section hour once when every day shares it, and day by day when
they do not.

**`public.program_registrations`** was dropped and recreated with
`schedule_ask` added before `answered_at` (a view cannot have a column
inserted in place). Same `security_invoker = true`, same grant.

### What the form reads

The hours a family may pick from are `availability_windows`, which already
existed — the admin's own editor writes them. `fetchOfferedWindows` reads
the ones that apply to the course being enrolled: the course's own, then its
program's, then the ones belonging to neither, which are the platform's
general hours. Only `active` rows, so switching one off in the editor takes
it off the enrolment form the same minute.

When the admin has opened no lecture hours at all, the form lets the family
name a day and a time themselves and says the admin will confirm it. That is
deliberate: an empty `availability_windows` must not be a wall a paying
family walks into.

---

## Hours belong to the school, not to a course (applied 2026-09-24)

The admin's weekly availability asked for a program and a course before it
would take a time. In practice that is the wrong question: the school teaches
at certain hours and every course is taught in them. Publishing one section
time had to be repeated for each course on the Marketplace, and the enrolment
warning listed eight courses that were all short of exactly the same thing.

So a window no longer carries a course. `loop_id`/`track_id` stay on the
table — rows written before this keep theirs and are still honoured, most
specific first — but the form writes `null` for both, and every course is
offered every window. **Which** course a hero is sitting is asked where it is
actually knowable: in *Who sits in this*, beside the day.

### `public.availability_windows`
| change | detail |
|---|---|
| **− check** | `availability_windows_on_a_course` (`loop_id is not null`, NOT VALID) dropped |

Nothing else on the table moved. `loop_id` was already nullable — the check
was the only thing enforcing it, which is why the one pre-existing
course-less row ("the hours we teach at") had survived: NOT VALID never
checked it.

### Functions that assumed a window had a course

Five of them did, and each would have silently dropped a course-less window
rather than failing loudly — a family's picks resolving to nothing, an
approval booking zero sittings, an empty roster.

| function | change |
|---|---|
| `private.resolve_plan(text, jsonb)` | join widened to `w.loop_id is null or w.loop_id = p_loop`. Without this every window a family picked resolved to nothing and `check_plan` refused the plan as "no longer offered". |
| `private.check_plan(uuid, text, jsonb)` | the "does this course run sections at all" probe counts school-wide sections too, so the every-day rule keeps being enforced |
| `public.suggest_windows(uuid, text, text, int)` | same widening, so a refused clash still has alternatives to offer |
| `public.window_roster(uuid)` | **dropped and recreated** as `window_roster(uuid, p_loop text default null)`. The course is `coalesce(w.loop_id, p_loop)`; a course-less window with no `p_loop` returns nothing, and the dialog asks for one first. |
| `public.assign_to_window(uuid, uuid, int, uuid)` | **dropped and recreated** with a fifth argument `p_loop text default null`. `v_loop := coalesce(v_w.loop_id, p_loop)`, raises `these are hours for every course -- say which course this hero is sitting` when both are null, and `that course is gone` when the id does not resolve. `session_bookings.loop_id` is `not null`, so a sitting always has a course even when the hour does not. |
| `public.answer_request(...)` | the booking insert joins `loops on l.id = coalesce(w.loop_id, v_req.loop_id)` and filters on `l.id = any(p_loops)` rather than `w.loop_id = any(p_loops)`. A course-less window books against the course the family actually asked for. |

The two dropped-and-recreated signatures were dropped rather than overloaded
so PostgREST has one function to resolve, the same discipline
`request_with_times` followed.

### Client

- `saveWindow` writes `loop_id: null, track_id: null`; `NewWindow` lost `loopId`.
- `windowRoster(windowId, loopId?)` and `assignToWindow(student, window, weekday?, batch?, loopId?)` carry the course.
- `ConfirmTimes` read `fetchWindows({ loopId })`, which is an `eq` on `loop_id` and so returned nothing once hours went school-wide. It now reads `fetchOfferedWindows({ loopId, trackId })` — the same resolution the family's own form uses.

### Supersedes

The closing note of the previous section said that with no lecture hours
open, the enrolment form lets the family name a day and a time themselves.
That is no longer true: the form has no free-text time in it at all. A course
with no lecture time or no section time cannot be enrolled in, the family is
told why, and the admin is warned on **Calendar → Weekly availability** with
the two ways out — publish the hours, or take the program off the families'
path on Material.

---

## A time is one intake's dated run (applied 2026-09-24)

This reverses the section above it, and goes further. Hours going school-wide
made publishing easy but left every other question unanswered: which intake
is this, and when does it stop. So a time now carries the whole answer —
course, batch, days, hour, and the two dates it runs between — and the
platform expands that into every real sitting. The admin never types a date
twice, and those generated dates are what a family reads when they enrol.

The batch is **named on the same form**. A batch is "the heroes who sit these
hours", so it is created with them rather than picked from a list made
earlier; an existing one can still be chosen, which is how a course's lecture
time and its section time end up in the same intake.

### `public.availability_windows`
| change | detail |
|---|---|
| **+ column** | `batch_id uuid references course_batches (id) on delete set null` |
| **+ column** | `starts_on date` — first date this hour runs |
| **+ column** | `ends_on date` — last date |
| **+ check** | `availability_windows_run` — `ends_on >= starts_on` when both are set |
| **+ index** | `availability_windows_batch_idx (batch_id) where active` |

All three are nullable rather than `not null`, because the rows written
before this exist and are still honoured: a null run falls back to the
course's own dates, exactly as every caller did before. The form requires all
three, so nothing new is written without them.

### `private.expand_window(uuid, int, date, date, int)`

Now clamps to the window's own run: the series runs from
`greatest(p_from, coalesce(w.starts_on, p_from))` to
`least(p_to, coalesce(w.ends_on, p_to))`. Putting it here rather than in each
caller means the dates a time is offered between are a property of the time,
not a range four call sites have to remember to pass. A run outside the
requested bounds yields nothing, which is what `generate_series` does when
its start is past its end.

### The callers
| function | change |
|---|---|
| `public.window_grid(date, date)` | open slots are drawn only within `starts_on`/`ends_on` |
| `public.assign_to_window(...)` | range is `coalesce(w.starts_on, l.start_date)` … `coalesce(w.ends_on, l.end_date)`; the sitting takes `coalesce(p_batch, w.batch_id)`, so the intake follows the time |
| `public.answer_request(...)` | same range, same batch fallback per booked window |

### Client

- `AvailabilityWindowRow` gained `batch_id`, `starts_on`, `ends_on`; `NewWindow` gained `loopId`, `batchId`, `startsOn`, `endsOn` — all required.
- The form asks Program → Course → Batch (cascading; the batch list is that course's), Days, Starts/Ends/Duration (all three editable and kept consistent), then First/Last date. It counts the sittings it is about to create before you save them.
- Saving creates the batch first when a new name was typed, because the time points at it.
- The dates default from the course's own `startDate`/`endDate` and stop following it once the admin edits either.
- `occurrencesFor()` reads several windows' real dates in one go; the parent's enrolment step shows `Runs 4 Oct – 20 Dec · from Sun 4 Oct, Sun 11 Oct, Sun 18 Oct` under each time.

### A bug found while testing

`datesBetween` (the form's own count) built its date strings with
`toISOString()`, which converts local midnight to UTC and so named the
*previous* day for every viewer east of Greenwich — Cairo included. These are
calendar dates, not instants; it now formats from the local components. The
same trap `private.expand_window` documents on its `generate_series` cast.

---

## An opening divides into sittings (applied 2026-09-24)

This corrects the section above it. `start_min`/`end_min` were read as the
length of one class; they are the **opening** a mentor is free in, and
`slot_min` is how long one sitting inside it runs. "Sunday, 01:00 to 03:00,
sessions of 60 minutes" is two bookable sittings — 01:00–02:00 and
02:00–03:00 — that a family chooses between, not one two-hour class.

The dated run added in the previous section is **removed**: a time is bounded
by its course again.

### `public.availability_windows`
| change | detail |
|---|---|
| **− column** | `starts_on`, `ends_on`, and the `availability_windows_run` check |
| **+ column** | `slot_min integer` — length of one sitting; null is the whole opening as one, which is how every earlier row behaves |
| **+ check** | `availability_windows_slot` — `slot_min between 15 and end_min - start_min` |

### `public.request_slots`
| change | detail |
|---|---|
| **+ column** | `start_min integer` — which sitting of the window was picked; null means the window's own start |
| **~ index** | `request_slots_one_idx` recreated as `(request_id, window_id, coalesce(weekday,-1), coalesce(start_min,-1))`. Two sittings of one opening are two different picks, so the minute has to be part of what makes a row unique. |

### `private.expand_window(uuid, int, date, date, int, int)`

Dropped and recreated with a sixth argument, `p_start_min`. It now emits one
row per **sitting** per date, by cross-joining a series of slot offsets:

```
len  = greatest(1, coalesce(nullif(w.slot_min, 0), w.end_min - w.start_min))
at   = w.start_min + i * len,  i in 0 .. (end_min - start_min) / len - 1
```

Integer division drops a remainder too short to hold a sitting, which is the
intended rounding: 01:00–03:30 at 60 is two sittings and a spare half hour
nobody is taught in. `p_start_min` pins one sitting, which is what booking a
family's actual choice needs — otherwise a 52-row limit would be spread
across every sitting of the opening.

### `public.window_slots(uuid)` — new

Returns `(start_min, end_min)` for every sitting an opening divides into.
The browser has the same arithmetic in `src/lib/slots.ts`, so a form can
show the sittings as they are typed; this is for anything server-side that
needs the list.

### The rest of the chain
| function | change |
|---|---|
| `public.window_grid` | draws one block per sitting, not per opening; the `starts_on`/`ends_on` clamp is gone with the columns |
| `private.resolve_plan` | resolves a pick to the **sitting's** bounds, and returns nothing for a minute that is not the head of one of the window's sittings — which is what makes `check_plan` refuse an invented time |
| `private.describe_week` | the notification names the sitting the family got, not the opening |
| `public.assign_to_window` | gained `p_start_min`; validates it is a real sitting, clashes against the sitting's own hour, and pins the expansion to it |
| `public.answer_request` | stores and reads back `start_min`, and books the pinned sitting |
| `public.request_with_times` | stores `start_min` on the request's slots |

### Client

- `src/lib/slots.ts` — `slotsOf`, `slotLength`, `slotCount`, the browser's copy of the division, with 13 tests including the dropped remainder and the inverted opening.
- The form's third box is now **session duration**, and the sittings it produces are listed as chips under it before you save.
- `OfferedSlot`/`slotKey` in `enrolTimes.ts`: a family's pick is `<window id>@<start minute>`, because two sittings of one opening share a window id. `planFromPicks` turns the picks into `{w, d, s}` for the server.
- The request now **sends** the picked slots. It previously sent `[]` deliberately — times were agreed off-platform — which is no longer how this works.
- The dialog enforces the course's `lecturesPerWeek` client-side, because `check_plan` enforces it server-side and a family should be told before they file rather than refused after.

---

## A section is a day, like a lecture

Applied to the dev project on 2026-09-24.

A section used to be an hour with no day: it ran on **every** day a family's
lecture left free, and the only thing anyone picked was which of the open
hours suited. That made the day a consequence rather than an offer — the
admin could not say "sections run Monday and Wednesday", and a family could
not say "not Thursday, we have football".

Now a section carries a weekday the same way a lecture does, and one row is
one day. What differs between the two is what the days *mean*:

- a **lecture's** days are the days it is taught on;
- a **section's** days are the days it is **open** on — a list of choices.

Which of those days any one family sits is settled on their enrolment form,
against their own lectures. So the admin is deliberately **not** stopped from
opening a section on a day that also teaches a lecture: a family not taking
that lecture day is free on it, and blocking it in the editor would take an
hour away from them to enforce a rule that is not about the offer. The rule
that does hold — **no section on a lecture day** — was already in
`check_plan`, and is where it belongs.

Nothing was migrated. Sections published before this still carry
`weekday = null` and still mean "every day the lecture leaves free"; every
reader handles both. `availability_windows_weekday_by_kind` already permitted
a section to carry a day (`kind <> 'lecture' or weekday is not null`), and
`window_grid`, `expand_window`, `resolve_plan`, `describe_week` and
`answer_request` all already resolved `coalesce(w.weekday, <the day asked
for>)` — so the only thing that had to change was the one rule that assumed
a section was daily.

### `private.check_plan(uuid, text, jsonb)`

| change | detail |
|---|---|
| **− rule** | `a section runs every day without a lecture -- still open: %` — dropped. A free day with no section is an ordinary answer now that the admin publishes which days are open. |
| **+ rule** | `pick at least one section hour -- open on %` — a week with no section at all is still refused, but only when a day was both free of their lectures and carrying an offer. |
| **= rule** | `no section on a lecture day -- drop the one on %` — unchanged, and now the only thing enforcing the separation. |
| **= rule** | `one section a day -- % has more than one` — unchanged. |

### Client

- `askProblem` in `programLength.ts` mirrors the new `check_plan`: a lecture, at least one section, none on a lecture day, one a day. The "name the days with no section yet" rule is gone.
- `enrolTimes.ts` gained `sectionsOn(offered, day)` (the sittings open on a day — a day-carrying section only on its own day, a day-less one on every day) and `sectionDaysOffered(offered, lectures)` (the days a family may choose from: open, minus the days their lecture takes). `Picks.sectionByDay` is now the days they **took** — a day with no entry is a day with no section, where it used to mean "default to the first hour on offer".
- **Admin → Weekly availability**: the Section tab has the same day picker the Lecture tab has. It opens on whatever the lectures leave and is editable from the first click; a day the intake also teaches a lecture on is drawn dashed as a note, never disabled. Saving writes one section row per day, through `saveWindowDays`. Editing a section published before this pins it to the one day picked, and says so before you save.
- **Family → Schedule**: one row per open day, each with a tick and its own hour. The days on offer are recomputed from the lecture they pick, so a day their lecture takes simply leaves the list. Unticking a day is how they take fewer.
- **Admin → Confirm times**: sections are ticked one per day rather than one spread across the week. A section hour falling on that student's lecture day is struck out and cannot be ticked.

---

## The length rule was on the wrong thing

Applied to the dev project on 2026-09-24. This is a **bug fix**, not a new
feature: the client and the constraint had drifted apart.

`openingOk` in the availability form has always bounded the **session** and
left the opening free — *"an afternoon of four 45-minute sections is four
legal sections, not one illegal three-hour one."* The constraint bounded the
**opening**:

```sql
when 'section' then ((end_min - start_min) >= 15 and (end_min - start_min) <= 120)
```

So a section opening longer than two hours passed every check the form makes
and was then refused by the database on save. 17:00–20:00 divided into
two 90-minute sittings — two perfectly legal sections — could not be
published at all. The same was true of a lecture: ten hours of two-hour
lectures is ten legal lectures, and the 360-minute ceiling on the *opening*
refused it.

### `public.availability_windows`

| change | detail |
|---|---|
| **~ check** | `availability_windows_kind_length` replaced. It now measures `coalesce(nullif(slot_min, 0), end_min - start_min)` — one **session** — instead of `end_min - start_min`, the whole stretch. A null `slot_min` still means "the session is the opening", which is the older shape and stays legal. |
| **~ rule** | A lecture session stays `between 30 and 360`. A section session now has **no ceiling** — how long a stand-up runs is the school's call, the same as a lecture's is — and keeps its floor of 15, which `availability_windows_slot` also holds. |

The opening itself is now bounded only by `availability_windows_order`
(`end_min > start_min`), `start_min`/`end_min` (inside one day) and
`availability_windows_slot` (a session must fit inside it). That is the whole
of it, and it is what the form has always claimed.

Existing rows were checked before the swap: every lecture session was 120 and
every section session 60, so the constraint validated without a rewrite.

### Client

- `SECTION_MAX_MIN` is **deleted**. `durationOk('section', …)` now checks only the floor, and the form's refusal reads "One section has to run at least 15 minutes."
- The doc comment on the limits says plainly that they bound a session, not an opening, so the next reader does not have to rediscover which.
- The form now names the **left-over tail**. 17:00–20:00 in two-hour sessions is one sitting and an hour nobody is taught in; it previously vanished into integer division without a word. It now says how much is left, when it starts, and the two ways to fix it. Choosing a session length and discovering one are different things.

---

## The family picks the session length

Applied to the dev project on 2026-09-24.

The admin's `slot_min` used to decide, for everyone, how a window divided.
An opening of 17:00–20:00 with `slot_min = 120` was one 2-hour sitting and
nothing else on offer. A family wanting 45-minute sections had no way to say
so.

Now the enrolment form asks the family how long each lecture and each section
should run, and the opening divides by **their** number. `slot_min` stays as
the admin's default, used when the family names none — every window published
before this keeps behaving exactly as it did.

### `public.request_slots`

| change | detail |
|---|---|
| **+ column** | `duration_min integer` — the length the family chose, null meaning "whatever the window says" |
| **+ check** | `request_slots_duration` — `duration_min is null or duration_min >= 15` |

### The chain

| function | change |
|---|---|
| `private.resolve_plan` | returns a sixth column, `duration_min`, resolved as `coalesce(slot.m, w.slot_min, whole opening)`. The grid a pick is validated against is now built from **that** length, so 17:00 and 17:45 are both valid starts when the family asked for 45 minutes, and 17:20 is not. Dropped and recreated: the return type changed. |
| `private.expand_window` | gained a seventh argument, `p_len`, which overrides `slot_min` when expanding a window into dates. Dropped and recreated so the new argument has a default and old six-argument calls keep working. |
| `private.check_plan` | validates the chosen length against the kind — a lecture 30–360, a section at least 15 — and its clash and overlap checks now use the chosen end, not the admin's. |
| `private.describe_week` | the notification names the sitting the family actually got. |
| `public.request_with_times` | stores `duration_min` on each request slot. |
| `public.answer_request` | reads `m` from the plan (or `duration_min` back off `request_slots`) and passes it to `expand_window`, so the booked sittings are the length the family asked for. |

### Client

- `slotsOf` / `slotLength` in `slots.ts` take an optional override; `slotsOffered`, `sectionsOn` and `sectionDaysOffered` pass it through. `Picks` carries `lectureMin` and `sectionMin`, and `planFromPicks` puts the length on each slot as `m`.
- The Schedule step asks **"Each lecture ___ minutes"** and **"Each section ___ minutes"**. Nothing is listed until a length is given: the times that appear are the ones that length actually divides into. Changing the length clears the picks, because a pick is `<window>@<start minute>` and the starts move.

## An opening offers a range of lengths (applied 2026-09-25)

The family typed a lecture length in minutes, anywhere from 30 to 360, and
any number divided any opening. Neither end was the admin's to set. Now each
opening carries the **shortest** and the **longest** one session may run, and
the enrol form turns that into an hours slider between the two. When no open
time suits the family, they can WhatsApp the admin from the form.

Two families asking for the same hour was never a problem and still isn't.
`request_with_times` holds no seat. The window's `capacity` is checked only
when the admin places a student through `assign_to_window`.

### `public.availability_windows`

| change | detail |
|---|---|
| **+ column** | `slot_max_min smallint` — the longest sitting a family may ask for here. Null reads as the shortest, one fixed length, which is how every row written before this behaved |
| **+ check** | `availability_windows_slot_max_min_check` — null, or at least 15 and never below `slot_min` |

`slot_min` keeps its column but gains a second job: it is now the **shortest**
sitting as well as the one a window divides by when a family names no length.
For every row already written the two readings are the same number, so nothing
moved.

### `public.pay_accounts`

| change | detail |
|---|---|
| **+ column** | `support_whatsapp text not null default ''` — the number the enrol form's "Chat with the admin" button opens. Empty hides the button |

### Functions

| function | change |
|---|---|
| `private.check_plan` | refuses a sitting outside its own window's range, before the clash checks: *that lecture length is not one the hour you picked offers — pick a length inside its range*. The kind's own 30–360 / 15 bounds still apply on top |

`resolve_plan` and `expand_window` are untouched: both already read
`slot_min` as the length to divide by, which is still what it means when no
length is given.

### Client

- `sessionRange(w)` and `lengthOffered(w, len)` in `lib/slots.ts` read the two ends off a window. `slotsOf` now returns nothing for a length outside them, so an opening only ever offers what it was published for.
- `lengthRange(windows, kind, days)` in `lib/enrolTimes.ts` gives the ends of the family's slider. A day offers the union of its own openings; one length has to suit every day picked, so the days intersect. Null when they cannot — Sunday at 90–120 and Tuesday at 30–60 leave no lecture that runs on both, and the form says so and offers the admin's WhatsApp.
- `stepFor(min, max)` keeps the slider on half hours, dropping to five minutes only when the admin's own ends would otherwise be unreachable.
- **Admin → Weekly availability**: the opening row is four boxes — opens, closes, shortest session, longest session — each captioned. Equal numbers mean one fixed length, which is what a new window starts as. The preview names the range and lists the sittings at the shortest.
- **Admin → Billing**: a "WhatsApp for families" number on the pay-accounts card, saved with the other fields.
- **Enrol form**: both length steps are sliders — **Lecture duration** and **Section duration** — bounded by what the picked days offer, and the times below re-filter as the slider moves. `whatsappLink` in `lib/format.ts` builds the `wa.me` link, prefilled with the program, course, hero and the days picked so far. It shows under the lecture times, under the section times, and on the "no times are open" panel.

---

## The family's own week (applied 2026-09-25)

Two things the family decides for themselves now: how many days the lecture
runs on, and how long each section is — day by day, not one length for the
whole week.

### Functions

| function | change |
|---|---|
| `private.check_plan` | the lecture count is no longer held to `loops.lectures_per_week`. A plan filed with no pending ask behind it may carry **one lecture or two**: *a week holds one lecture or two — 3 picked*. Once an ask is pending, its own `lectures_per_week` is the number the plan has to match, so the admin's booking still lands on exactly what the family asked for: *they asked for 1 lecture a week — 2 picked*. Everything else in the function is unchanged |

The course's `lectures_per_week` stays where it is and keeps its 1–2 check.
It is the rhythm the course suggests, and what Admin → Programs sets; it is no
longer a gate the family's own ask has to pass.

### Client

- `MAX_LECTURE_DAYS` in `lib/programLength.ts`, and `askProblem` refuses a third lecture: *A week holds one lecture or two.*
- **Enrol form → Lecture days**: the question is "Which days for the lecture?", answered with one day or two. A third day's button goes dim rather than pushing the first one out, and Next is live from the first day.
- **Enrol form → Section time**: one row a day — the day, a slider for that day's length, then the openings that fit it as chips. Each day carries its own length, so Monday can run an hour while Tuesday runs an hour and a half. "Same every day" copies the first day's length **and** its start across the rest. The rows sit on the left of the step, with **Program length** and the admin's WhatsApp in a column beside them, so the whole step reads without scrolling.
- `Picks.sectionMinByDay` in `lib/enrolTimes.ts`, read through `sectionMinOn(picks, day)`, with the old single `sectionMin` kept as the fallback. `weekFromPicks` and `planFromPicks` resolve a length per day; a day whose length no opening holds drops out of the week.
- The dialog is no longer a fixed 820px tall: it is `height: auto` under a `max-height` of the window, so a step is as tall as what it holds and a longer one scrolls inside `.ef-center`. The Section time step also tops out at 760px wide rather than 440px, and aligns to the top instead of the middle.
- `snapRange(range, step)` replaces `wholeHourRange`: the lecture slider stops on whole hours, the section slider on half hours, each still inside what the admin published. When the published range holds no such stop (90–110 minutes, say), the finer notches come back so the opening stays reachable.
- **Admin → Students & payments → Payments**: a **Schedule** column beside Program. It reads the ask behind the payment (same course first, then same program, then that student's newest) and opens the week in a dialog: a row a day with the day, whether it is the lecture or the section, the clock time, and how long it runs — plus the lecture/section counts and the hours a week above it. A top-up or a kit has no week and shows a dash. No SQL: the column reads `access_requests.schedule_ask`, which was already there.

## Approving is the booking (applied 2026-09-26)

| function | change |
|---|---|
| `public.schedule_student` | the enrolment it writes is `private.open_program(student, track, **request.loop_id**, admin)` rather than passing `null` for the course. A request for one course now opens that course, the way `approve_payment` already did; a request for the whole program still opens every course of it. Nothing else in the function changed |

### Client

- **Admin → Payments → Approve**: accepting a program payment now books the week itself. It takes the student's pending ask, and if the week parses and passes `askProblem`, calls `schedule_student` with it — the sittings land on the admin's calendar and the family's, the course opens, the request is answered, and the parent and student are notified. One toast: *… is enrolled in … — their week is on the calendar*. The schedule form only opens when there is nothing bookable: a renewal with no ask, an older row that carries a count and no days, or a clash the admin has to move.
- **Admin → Calendar → Schedule**: the grid holds the heroes' sittings only. A block reads `17:00 · Lecture · 2h · Omar Hassan` — the hour it starts, which kind of sitting it is, how long it runs and whose it is; the course name left the block (the program pills and the Timetable already name it). Published windows nobody has taken are no longer drawn there — they stay in the Timetable reading, whose **Show open slots** tick now appears only in that shape, and in the Weekly availability tab.
- **Admin → Students & payments → Calendar**: the admin calendar is a tab of that page now, beside the payment that books onto it. `/admin/calendar` redirects to `?tab=calendar`, and the rail entry is gone — the page it lived on is already on the rail. Heroes sharing an hour are one block with a head count (*17:00 · Lecture · 2h · 4 heroes*); an hour with one hero still carries their name. The Timetable reading still counts each hero, so its Heroes column and the grid agree.

## An intake belongs somewhere (applied 2026-09-26)

Reading a family's part of the world off the clock their browser is set to —
no question asked at enrolment, right the first time for a family enrolling
from home. A VPN or a holiday reads as somewhere else; the admin can always
book by hand, and the family can always ask for a time.

| object | change |
|---|---|
| `public.course_batches.region` | new `text not null default 'anywhere'`. `'anywhere'` or a country code (`CA`, `EG`, …) matched against the family's own timezone. The existing *batch 1 - canada* was set to `CA` |
| `public.schedule_student` | the sittings it books now carry `batch_id`: the intake the admin answered the request into, or — when they never named one — the intake that published the hours the family picked (`request_slots` → `availability_windows.batch_id`). The request is stamped with it too, so the calendar can say whose intake an hour is |
| `public.pay_accounts.support_whatsapp` | filled in with `+201009937773` where it was blank |

### Client

- `lib/region.ts` — `REGIONS` (Egypt, Saudi Arabia, UAE, Kuwait, Qatar, Canada, United States, United Kingdom, Germany, France), `regionOfZone`, `viewerRegion`, `batchOpenTo`, `inViewerRegion`, covered by `region.test.ts`. A zone the list does not name reads as *no region*, which is offered everything marked Everywhere and nothing claimed by a country.
- **Admin → Programs → Batch**: a **Who it is for** picker on the new/edit batch form, and the region beside each batch in the list.
- **Enrol form**: `fetchOfferedWindows` drops the hours of an intake run for another country, so a family in Cairo is never offered the Canada intake's times. Hours with no intake behind them stay open to all. The admin's own `ConfirmTimes` passes `region: 'all'` — they book for families anywhere.
- **Admin → Calendar**: a block names its intake — *17:00 · Lecture · 2h · batch 1 - canada · 4 heroes*.
- **Enrol form → no times**: the "nothing open" panel now also says the open hours may be run somewhere else, and its **Chat with the admin** button falls back to `SUPPORT_WHATSAPP` (`+201009937773`) when Payment settings carries no number — so the way out is never a dead end.

## The calendar, read intake by intake (applied 2026-09-26)

| function | change |
|---|---|
| `public.window_grid` | dropped and recreated to return `batch_id` as well (a `returns table` signature cannot be replaced in place). Same body otherwise, still `security definer` and still gated on `private.is_admin()`; grants restored to `authenticated, service_role` exactly as before. An untaken hour now knows which intake published it, so it is read under that intake |

### Client

- **Admin → Students & payments → Calendar → Schedule**: one card an intake, headed by its name with the course, region, status and seats beside it, and holding that intake's own month grid and its own timetable — the Calendar/Timetable switch, the program pills, the Lectures/Sections filter and the batch picker all narrow every card at once. Sittings that belong to no intake fall into a last card, *No batch yet*.
- A block inside a card no longer repeats the batch name — the card it sits in is the batch. It reads *17:00 · Lecture · 2h · 4 heroes*.
- `ScheduleTable` takes `bare`: inside an intake's card it drops its own card chrome and preamble, so a program is a heading rather than a second card around the table.

## The family says where they are (applied 2026-09-26)

The browser's clock is now only the first guess: the enrol form opens by
asking, and the admin can correct the answer on Payments.

| object | change |
|---|---|
| `public.profiles.region` | new nullable `text` — the country code this family belongs to (`CA`, `EG`, `SA`…). Null is nobody has said |
| `public.request_with_times` | dropped and recreated with a trailing `p_region text default null`; when it carries a country, the ask stamps it on the parent's and the hero's profile in the same transaction. Grants restored exactly (`public`, `anon`, `authenticated`, `service_role`). Everything else in the function is unchanged |
| `public.schedule_student` | the intake fallback now ends with "a course with one intake has no ambiguity": when neither the request nor the picked windows name a batch, a course that has exactly one gets it |
| data | every sitting and request that carried no intake was given the only batch of its course — the 43 sittings that were reading as *No batch yet* are now **batch 1 - canada** |

### Client

- **Enrol form → step 1, "Where you are"**: the family picks their country before anything else, one button a country, with how many intakes are open there underneath and a *Somewhere else?* WhatsApp line below. The browser's clock preselects one; the family's answer is what counts. Verified at 860px (3 columns × 4 rows) and at 375px (2 × 5), nothing overflowing, the dialog still inside the window.
- The form now loads every published hour once (`region: 'all'`) with the intakes' regions beside them, and narrows them to the chosen country in a memo — changing the answer re-filters without another round trip.
- The ask carries `region`, so filing it records where the family is.
- **Admin → Payments → Country**: a column beside *For*, a select per row. Saving writes the parent's and the hero's profile together (`setFamilyRegion`), because they live in the same house.

## Payments, with less on it (applied 2026-09-26)

No SQL. The Payments table had grown to twelve columns and scrolled sideways
at every width, which is how the Approve button kept ending up off-screen.

### Client

- **Admin → Payments**: six columns instead of twelve — **Family** (name, contact, the country select, when they filed), **For** (the hero, their week behind one button, what they wrote), **Program**, **Sent** (amount, method, who from, the screenshot), **Status** (the badge, the countdown, what they are paid up to, the note), and the buttons. Nothing was dropped; each column is one idea with its own lines. At 1280px the table is 990px and does not scroll sideways at all; at 1024 it is 823px against a 734px page, so a narrow window still scrolls a little — it used to need half again as much.
- The action buttons wrap instead of forcing the row wide, an empty week prints nothing rather than a bare dash, and the deadline reads *paid to 8 Oct / closes 3 Oct* under the countdown it belongs to.
- **Admin → Students → a parent**: a **Country** row in their Contact card, the same select. Saving moves the parent and every hero on the account together (`setFamilyRegion`, which moved to `api/students.ts` where profile writes live). `Guardian` and both parent reads carry `region` now.

## Teaching hours count themselves (applied 2026-09-26)

No SQL. `loops.duration_hours` is still written — it is now the sum rather
than a number somebody typed.

### Client

- `courseHours(course, sessions)` in `lib/programLength.ts` adds up the `durationMin` of every session inside a course — lectures and sections alike — and falls back to the hours on the course's own record while it has no sessions (or only zero-length ones).
- `programHours(courses, sessions?)` takes the sessions and adds each course up from them; without them it reads the stored hours, exactly as before. It still answers null when any course has no hours at all, because half a sum reads as a shorter program.
- **Admin → Material → a course**: *Duration — teaching hours, lectures and sections together* is read-only once the course holds a session, showing the total (*4.8 h*) with the count it came from underneath. An empty course still takes a typed number, and saving stores whichever applies.
- The two places that show a program's length — the family's enrol form and the admin's schedule dialog — now pass the sessions, so the weeks a family is promised follow the timetable instead of a number that could drift from it.

## The parent's page is the heroes, and the mentor writes in words (applied 2026-09-28)

Two migration files this time, not only a log entry — `supabase/migrations/`
was already missing everything above, and widening that gap while the
production question is open would be a choice nobody made on purpose.

```sql
-- 20260927205845_mentor_feedback_per_session.sql
alter table public.mentor_feedback
  add column if not exists session_id text
  references public.sessions (id) on delete restrict;

alter table public.mentor_feedback
  drop constraint if exists mentor_feedback_student_id_day_key;

-- 20260927210400_mentor_feedback_upsert_key.sql
create unique index mentor_feedback_one_per_day_idx
  on public.mentor_feedback (student_id, day, session_id) nulls not distinct;
```

The first wrote that index over `coalesce(session_id, '')`, which is an
expression PostgREST's `on_conflict` cannot name — it takes a column list.
`nulls not distinct` says the same thing in plain columns, so the upsert from
the client still works: one general note per hero per day, and one note per
sitting beside it.

`on delete restrict` matches `submissions.session_id`. A sitting somebody
wrote about is not a sitting to delete quietly.

### Client

- **Parent → after signing in** lands on Material rather than My Heroes (`HOME.parent`).
- **Parent → My Heroes** is the hero list alone. The Performance tab, the hero slicer, the two charts and the mentor card went with it, and `perfCharts.tsx`, `usePerformance.ts` and the `.perf-*` half of `live.css` went with them — this page was their only caller. Add hero, Password, Feedback and Buy a program all stay where they were.
- **Student → Payments** is gone: the route, the rail item and the allow-list entry. `SubscriptionGate` already told a student to ask their parent, and nothing else pointed at it.
- **Student → My Progress** keeps its four tiles, the project lists, the courses and the mentor's notes; the three charts (*Turning up*, *What was marked*, *Projects*) and the *My Work* tab are gone, so the page is the Learning area only.
- **Mentor notes are typed, not recorded.** The recorder, the player and the signed-link helpers are deleted; `MentorVoice.tsx` with them. The two voice columns stay on the table and old clips stay in the bucket — they are simply not read. A note now carries the session it is about, or none.

## Marks, attendance, and a board the mentor moves (applied 2026-09-28)

Three more migration files: `20260927210349_video_checks_are_answers.sql` and
`20260927210940_attendance_on_sittings.sql`, after the two above.

### A question the video stops for is worth marks

```sql
alter table public.submissions
  add constraint submissions_task_kind_check check (
    task_kind = any (array['mcq','multi','short','long','upload','link','imagetext','check'])
  );
```

`submit_answer` now looks for the task in `content.titles[*].video.checks[*]`
when it is not among the tasks, records it as `task_kind = 'check'`, and
auto-grades an MCQ checkpoint exactly as it grades an MCQ task. A checkpoint
is not a step in the flow, so it never writes `step_progress` — otherwise
answering one would silently tick a step the hero never opened.

**`imagetext` was fixed on the way past.** It has been authorable in the
editor since the editor had tabs, and the check constraint never listed it —
`submit_answer` raised *unknown task kind*. Image-and-text answers could not
be submitted at all. They can now.

**And the answer key stopped travelling with the question.** `sessionToPayload`
stripped `correct` from task options only; a checkpoint's options carried the
right answer in the readable content JSON, where any student could read it off
the network tab. Checks now go through the same `keys` blob.

### Attendance, recorded rather than guessed

```sql
alter table public.session_bookings
  add column joined_at timestamptz,
  add column attended boolean,
  add column confirmed_by uuid references public.profiles (id) on delete set null,
  add column confirmed_at timestamptz;
```

Two functions, both `security definer`, execute revoked from `anon`:

- `join_booking(uuid)` hands over `meeting_url` and stamps `joined_at` — to
  the hero, their guardian, or an admin, and only from a quarter hour before
  the start until a quarter hour after the end. The link is not printed
  anywhere, because asking for it *is* the claim.
- `confirm_attendance(uuid, boolean)` is the record, admin only, and moves a
  `booked` sitting to `done` as it writes.

`joined_at` is a claim; `attended` is the record. A tab left open claims as
loudly as a hero who sat the hour, so the two are kept apart and the measures
count the second one.

### Client

- **`lib/scores.ts`** is the one place the four measures are worked out, so the admin table, the hero and the family all read the same arithmetic. **Tasks** and **Activities** are earned over possible on *marked* work — tasks and checkpoints respectively. **Focus** is earned over every task the session holds, an unanswered one counting zero: it answers how much of the work is being done, where Tasks answers how well the marked part scored. **Attendance** is confirmed over held, and a sitting nobody confirmed reads as a gap on purpose.
- **Admin → Students & payments → Students feedback**, a new tab. Every hero's session with the four measures and the mentor's note, folded intake by intake. The note written here is the note on the family's feedback page — `mentor_feedback` with a `session_id`, not a second table.
- **Admin → Calendar** gains an *Attendance* reading beside Calendar and Timetable: the meeting link for each sitting, editable in place, and Present / Absent once it has finished.
- **Student and parent → Calendar** show a *Join the class* card while a sitting is open. It calls `join_booking`, so turning up is recorded by the act of going in.
- **Projects are a board now, and the mentor owns the columns.** A `Title` carries `state` — `done` / `building` / `soon` — set from the group menu in the session editor beside *Make it a project*. It was derived from ticked steps before, which meant nobody could say a project was finished; it rides in `sessions.content`, so there was no schema change. Every hero on that course reads the same column, because the state is on the project, not on the hero. The bar inside each card is still the hero's own progress.
