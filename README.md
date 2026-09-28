# IBSRA Heros — platform (dev stage)

React + TypeScript + Vite, on a Supabase backend: sign-in for **admin** and
**student**, with programs, courses, sessions, progress, answers and files in
Postgres + Storage. See [Backend](#backend) below.

Without the Supabase keys (or with `VITE_BACKEND=off`) it runs as the local
demo: no login, a role switcher, and all data in a Zustand store persisted to
`localStorage`. The parent area and the marketplaces still run on that demo
data in both modes.

## Run it

```bash
npm run dev
```

Opens on <http://127.0.0.1:5180>. `npm run build` produces `dist/`,
`npm run typecheck` runs `tsc`.

> Node was installed via winget as a portable package. If `node` is not on
> your PATH in a new shell, it lives at
> `%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_*\node-v24.19.0-win-x64`.

## Backend

Supabase project **ibsra-heros** (`rtutioamxwlihudawhmc`, eu-central-1). Never
point this app at the `registerationForm` project — that is the live database
of the older student dashboard.

**Accounts.** Three roles: admin, student, parent. The first admin is
`ibsra.education@gmail.com`, created once in the Supabase dashboard
(Authentication → Add user, *Auto Confirm*); a trigger makes that email the
admin. The admin creates students on **Admin → Students** with a temporary
password, and the student chooses their own at first sign-in.

A **parent** is the one account that signs itself up, at `/signup`, and it adds
its own children. That runs through the `parent-users` Edge Function with the
server key, not through Supabase's own sign-up, so the project's public
sign-up setting can stay **off** in the dashboard
(Authentication → Sign In / Providers).

**What is on the server.**

| Where | What |
|---|---|
| `supabase/migrations/*_auth_profiles.sql` | `profiles` (role admin/student, disabled, must_change_password), sign-up trigger, guards |
| `*_content.sql` | `tracks` → `loops` (courses) → `sessions`; `enrollments`; `admin_save_session()` |
| `*_student_activity.sql` | `step_progress`, `submissions`, `submit_answer()` (multiple choice graded on the server, one try) |
| `*_storage.sql` | private buckets `materials` and `submissions`, opened with signed URLs |
| `*_parent_role.sql` / `*_parent_payments.sql` | the `parent` role, `tracks.price_egp`, `guardians`, `pay_accounts`, `payments`, `approve_payment()` / `reject_payment()`, bucket `payment-proofs` |
| `supabase/functions/admin-users` | create / pause / reset / delete student accounts (admin only) |
| `supabase/functions/parent-users` | a family's own sign-up, and the children it adds (its `signup` action is the one public endpoint) |

A session's topics, videos, materials and tasks are one JSONB document
(`sessions.content`). The answer keys — which options are correct, and the
grading note — are stripped out of it and kept in `session_keys`, which only
an admin can read, so they never reach a student's browser. Every table has
row-level security: a student reads only published, released sessions of the
courses they are enrolled in, and only their own progress and answers.

**In the app.** `src/lib/auth.tsx` (sign-in state), `src/lib/routeAccess.ts`
(who may open which page), `src/lib/api/*` (tables, RPCs, storage),
`src/lib/sync/*` (the store stays the UI's source of truth; admin edits and
student ticks are sent in the background, with a save badge in the top bar).
Videos are links (YouTube unlisted, Vimeo, Google Drive); material files and
student uploads go to Storage.

**Run the demo instead:** `npm run dev -- --mode demo` (reads `.env.demo`,
`VITE_BACKEND=off`) on port 5181.

**Deploying (Vercel):** set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`, and add the Vercel domain to Supabase →
Authentication → URL Configuration.

## Switching roles (demo mode)

The four role dashboards are switched from the pill group in the top bar —
Admin · Instructor · Student · Parent. There is no login; the URL is the
source of truth, so `/student` deep-links straight into the student
dashboard and the sidebar follows.

`Ctrl/⌘ + K` opens a command palette that jumps to any page, any session, or
switches role.

## Content model

```
Track  (a skill: AI video, n8n automation, Canva design, data ops, AI integration)
 └─ Loop  (the 8–10 week unit families buy)
     └─ Session  (recorded or live)
         └─ Title  (one teaching topic)
             ├─ Video     — one recording, or none
             ├─ Material[] — pdf / slides / sheet / link / code / image / dataset
             └─ Task[]     — Q&A: single choice, multi, short, long, upload, link
```

This is the structure the CMS is built around: a session is a container,
a title is the unit that actually carries a recording, its material and its
questions.

Alongside it, and deliberately separate, sits the catalogue:

```
Product  (one thing a family can buy)
  category   training program · kit
  price · pricePerCourse? · installments? · deposit? · upfrontDiscount?
  summary · description? · skill? · duration · age band · seats · dates · delivery · inclusions
  thumbnail? cover art — an image URL or a CSS gradient
  trackId?   optional link to a Track — course/session counts read live
  loopId?    optional link to one Loop
```

A Loop is the teaching unit that runs; a Product is the offer with a price on
it. They are not the same object, and a product that names no track invents
no content counts.

## Admin CMS — what is built

- **Overview** — KM-1 (loop income conversion), KM-2, KM-3 (education
  payback), plus what is blocking content from publishing and which track
  actually gets students earning.
- **Sessions** — search, filter by track/loop/type/status, sort, multi-select
  with bulk publish/draft/archive/delete, row menus, duplicate.
- **Session editor** — three-region layout: header with the publish gate,
  a title rail (drag to reorder, add, duplicate, delete), and a tabbed pane
  per title: Recording · Material · Q&A tasks · Title settings.
- **Publish gate** — `readiness()` in `src/lib/store.ts` lists what blocks a
  session: a title without a recording, a video still processing, a title
  with no Q&A, a blank question, a live session with no link or date.
  Publish stays disabled until the list is empty.
- **Tracks & loops**, **Students / Instructors / Parents**, **Cohorts**,
  **Income & ROI**, **Settings**.
- **Marketplace** — CRUD over the catalogue, in two categories: training
  programs and kits. A new training program is built in two steps: the form
  takes its description (summary, full description, skill, inclusions, cover)
  and its financial values (full price, price per course, instalments, deposit,
  paid-in-full discount — previewed as the family will read them); saving it
  creates the program in **Material** and lands there, where it is built in
  order — courses (numbered folders, each starting after the last one ends),
  then the sessions in each course, then the topics in each session. Create,
  edit, duplicate, archive and delete; filter by category and status; search
  by name or summary. `productReadiness()` in `src/lib/store.ts` is the same
  discipline as the session publish gate — a listing cannot go live without a
  name, a summary, a price, a duration, seats, a sane age range and (unless
  it is a kit) a start date. **List it** is what puts it in front of a family;
  nothing else in the CMS does. A listing may point at a real track or loop,
  and then its course count, open sessions and content length are read off
  the store rather than typed in twice. Listings are shown as a card grid with
  their cover art, so the admin is looking at what a family will see; the cover
  and the title open the editor.

## Student — what is built

Three surfaces in the rail, nothing else: **Missions · Performance Analysis ·
MarketPlace**. The rail shrinks to icons from the
Collapse control at its foot, and the choice is remembered.

- **Missions** — a card grid, three sections deep: **Program → Course →
  Sessions (topics)**. Every section carries the same horizontal slicer,
  **In progress / Finished**, with counts on the control so an empty side is
  never a surprise. It holds only what the student is enrolled in. A
  program they are not in is a thing to buy, not a thing to open, so it is
  not a locked folder here — it is listed in MarketPlace instead, and
  deep-linking to one lands on a note saying where to find it. Only
  `published` sessions are reachable.
- **MarketPlace** — the two catalogue categories as a card grid, driven
  entirely by what the admin has listed. Every card carries its cover art, the
  price, duration, dates, age band, seats left, where it runs and the mentor;
  a listing linked to a program also shows its course count, open sessions and
  content length read live off the curriculum. The program the student is
  already on is marked *You are on this* rather than hidden, so they can see
  what the rest of it covers, and anything outside their age band is labelled
  rather than removed.
- **The listing page** — `/student/marketplace/:id`, and the parent has the
  same page at its own path. The whole card opens it. It carries every
  inclusion (the card shows what fits), the practical detail, who teaches it,
  and — where the listing points at real curriculum — the actual courses and
  their **published** sessions, with topic and question counts. Nothing on it
  is a prospectus: a session still in draft is not counted.
- **Cover art** — a listing may carry an image URL or a CSS gradient. Left
  empty, `coverFor()` generates one from the listing's own colour at an angle
  fixed by its id, so a new listing looks finished before anyone finds art and
  the grid never reads as one flat texture. Every seeded cover is a gradient,
  because this build makes no network calls.
- *Ask to join* flags interest for the mentor; it does not reserve a seat or
  take payment, and the page says so under every category. Interest is held in
  the store next to theme and rail state, so the card and the listing page can
  never disagree about what has been asked for.
- **Session view** — three regions. Material on the left with a drawing
  surface over it, **one step** in the middle — the one clicked in the
  contents rail, or the one *Next* moved to, never the whole session stacked
  up — and that rail on the right carrying the running order. Opening a
  session lands on the first step not yet finished, so returning resumes.
  Material sits *beside* the video rather than replacing it, because reading
  the workbook while the recording plays is the behaviour being designed for.
  Both side panels collapse.
- **Annotation** — pen, highlighter, note and eraser with six colours, undo
  and clear. Strokes are held in normalised coordinates, so they stay on the
  same word when the reader zooms the document or collapses a panel. Nothing
  leaves the browser; it is a reading aid, not a submission.
- **Watermark** — every material page carries the reader's own name through
  it. Leaked material is traceable and the reader knows it.
- **Progress** — ticking a topic done is held in the UI store next to theme
  and rail state (`ibsra.ui.v1`), not in the content DB, because it is the
  student's own reading progress rather than a graded record. Finished is
  then derived upward from one place: every topic done → the session is
  finished, every open session finished → the course is, every course
  finished → the program is. So no slicer can disagree with the one above it.
  Marking done is a toggle, not a one-way door.

Performance Analysis is routed so its button lands somewhere honest, and says
plainly that it is not built. Financial Analysis was taken out of the student
rail; an old `/student/financial` link lands on Missions.

The player is a preview: it runs a progress bar against the recording's real
length at 12× so the watch → mark done → next workflow can be walked through.
It is labelled as such on screen. The pipeline itself is stage 2.

## Parent — sign-up, students and payments (live)

The one self-serve path in the product, and the only place money is handled.

1. **Sign up** at `/signup` — name, email, password typed twice (both fields
   have a show/hide eye). It always creates a *parent*; the role is decided on
   the server, never asked for in the form.
2. **My Students** (`/parent/children`) — the parent adds each child with the
   password they will sign in with. Name, email, **age**, **phone** and the
   confirmed password are all required, on the form and again in
   `parent-users`. The child account opens nothing on its own: with no
   enrolment its dashboard is empty.
3. **Buy a Program** (`/parent/enroll`) — the programs an admin has priced
   (**price on the program form**, EGP; empty means not for sale). The family
   sends the fee themselves, by **InstaPay** or **Vodafone Cash**, to the
   numbers on **Admin → Payments**, then files the transfer here: amount, the
   address or number it came from, and a screenshot (bucket `payment-proofs`,
   private, signed URLs).
4. **Payments** (`/parent/payments`) — what they filed, and the answer.
5. **Admin → Payments** — every transfer, waiting ones first, with the
   screenshot and both people's details. **Approve & enrol** is the enrolment:
   `approve_payment()` writes one active enrolment per course of that program
   in the same transaction, so the student's Missions fill up immediately.
   **Reject** carries a reason the family reads, and they can file again.

**First subscription at enrolment.** When a parent presses *Enroll* for a hero
with no live subscription (and nothing already waiting), the dialog adds two
steps before the request goes in: **IBSRA wallet or pay directly**, and the
plan — **monthly (30-day countdown)** or **quarterly (90-day)**. Paying
directly asks for InstaPay / Vodafone Cash, the amount and a screenshot
(required), filed via `file_subscription_payment()`. The last screen thanks
them and says the admin will confirm the enrolment. The wallet starts the
countdown on the spot (its money was confirmed when it was charged); a direct
transfer starts it when the admin accepts it. Accept and reject both notify
the parent, and a rejection must carry a reason. See `schema-changes.md` §5.

Nothing here trusts the browser: a parent may only file a payment for a child
of their own, may never review one, and an enrolment is only ever written by
`approve_payment()` or by the admin on the Students page.

## Parent — the marketplace

The parent dashboard carries the **same catalogue component** as the student —
one `Catalog` in `src/roles/marketplace/`, so a family and their child can
never be quoted two different prices, seat counts or dates. The framing is the
parent's: how many listings fit their child's age, the cheapest of those, the
next one to start, and *Already enrolled* on the program being paid for. The
reporting summary carries a third jump card into it.

Instructor and the rest of parent are still deliberately shallow — they read
the same store, so anything authored in the CMS shows up in them immediately, but
submissions, grading, payments and the income log are stage 2. Each carries a
"Sketched, not built" note saying so.

## Parent — AI summary, assistant and mentor feedback

**See the proof** — every card on the performance pages (the Overview's five
figures and four page cards, and every card on Scores, Learning, Assets and
Return) opens a pop-up showing where its number comes from, as charts built
from the same slice, plus a plain-English "how this is worked out"
(`src/roles/parent/proof.tsx`). **Commitment Score** replaces the attendance
score: the average of three habits — came to live classes, handed homework in,
handed it in on time — with any habit that has nothing to measure yet left out
rather than counted as zero. Chart colours are a validated trio per theme
(`proof.css`). Mentor feedback is kept **per day**: the card shows the latest,
and clicking it opens a pop-up with a date slicer to read earlier days.

**Ask AI** is the first tab of Performance analysis — a full-page chat for a
parent who just wants a quick answer, with ready questions. Every answer, in
the tab, the pop-up and offline, is a few short bullet points in plain,
everyday English: "came to 9 of 10 classes", "money from real clients", never
"payback ratio" or "cohort". Every page of the report (Overview, Scores,
Learning, Assets, Return) carries **its own mentor note**, posted separately.

Under the doors on **Performance analysis → Overview** sit two cards
(`src/roles/parent/Insight.tsx`):

- **AI summary** — an honest read of the slice: the strongest figure first,
  then attendance, marks, topics, assets and return exactly as they stand, and
  what comes next. Gaps are stated as what is still to come, never as a
  weakness; the return line carries n, the median and the share at zero like
  every other income figure. It is written in the browser from the numbers, so
  it always matches the page. Its field opens the **assistant** in a pop-up,
  with ready questions or the parent's own.
- **Out of scope goes to the mentor** — why a mark was given, schedule,
  payments, anything personal or not in the report. The assistant says so and
  offers **Ask the mentor**, which opens `/parent/mentor` with the question
  pre-written and the conversation attached.
- **The model** — `src/lib/ai.ts`, any OpenAI-compatible endpoint, defaulting
  to OpenRouter's free open-weights Llama 3.3 70B. Set `VITE_AI_KEY` in
  `.env.local` (see `.env.example`). Only the report's numbers and the
  conversation are sent, never a name. With no key nothing is sent and the
  assistant answers from the report locally. Pollinations (keyless) was tried
  first and now rejects anonymous browser calls with a bot check. A `VITE_` key
  is visible in the bundle, so before shipping the call moves behind a proxy.
- **Mentor feedback** — the mentor's daily note for that program, with the
  date and time it was posted on the card itself; a note not posted today reads
  "Updated 17h ago" in gold. It is written in **Admin → Mentor feedback**
  (`/admin/feedback`), where each student shows *due* or *posted* for today,
  and where parent questions are answered as the mentor. Notes and messages
  live in their own store (`ibsra.mentor.v1`), not the content DB.

## Performance Analysis — the measured module

A second, separate performance module built to the *Performance Dashboard POC*
brief (v1.0). It does not read the Zustand store and shares no code with the
existing parent performance pages: it is built on real collected records —
attendance, help logs, marks, weekly pulses, peer ratings, monthly reviews,
assets, payments — so that every figure has a row behind it.

```
src/lib/perf/
  types.ts       one type per table in §9, plus the Card / Area shapes a view reads
  time.ts        ISO weeks, months, quarters — the three windows every formula cuts against
  calc.ts        the fourteen cards as pure functions; no store, no clock, no role
  sentences.ts   the §5 outcome templates; the only place prose is generated
  glossary.ts    every label, EN and AR (§12)
  highlights.ts  the quarter chips (§6)
  dashboard.ts   role filtering — what a parent, a student and an admin are each sent
  history.ts     the last six monthly readings, by recomputing the card with the clock wound back
  fixtures.ts    four students on a fixed clock: improving, flat, declining, thin
  calc.test.ts   71 tests
supabase/migrations/20260912090000_performance_core.sql
```

The module has no page at the moment: the parent "His Quarter" screen that
read it was taken out of the rail, along with Investment Analysis, the student
"My Quarter" page and the admin analysis surface. The calculations, the
fixtures and their tests are kept, so a screen can be put back on top of them
without the rules being rewritten.

The rules that are enforced in code rather than asked for in review:

- **Start → now, or nothing.** A card whose baseline is not locked yet is
  `baseline` and shows the current reading alone, labelled as a first reading.
  A card under its minimum data points is `collecting` and shows no number.
- **A fall is shown.** Every card that can decline has a declined sentence,
  and a test asserts it. There is no branch that rounds a drop up to flat.
- **Colour is admin-only.** `dashboard(input, view)` strips `status` and
  `internals` before the object exists, so a parent client is not sent a red
  card and told not to render it.
- **The student never sees money, a mark as a percentage, a peer rating as a
  number, or happiness.** Those cards are dropped or reduced to a word label
  server-side, asserted by test.
- **No proof without consent.** `proofFor()` filters on `consent_on_file`; an
  asset missing consent does not count towards a live-work figure either.
- **Baselines lock.** `level_start`, `confidence_start` and `skill_start[]` are
  guarded by a Postgres trigger: a change after the lock date needs
  `perf.override_reason` set and writes an audit row.

Run the tests with `npm test`. The migration is written but **not applied** —
it creates `perf_*` tables in the new Supabase project and touches nothing that
exists.

## Deliberately not built

Listed in-app under Admin → Settings:

- **Authentication and roles** — the switcher stands in for it.
- **Video pipeline** — attaching a recording is instant. Upload, transcode
  and the processing state are modelled but not wired.
- **Payments** — checkout, instalments and the 4-course bundle. Prices are
  authored and displayed; nothing on any surface charges, invoices or reserves.
  Asking about a listing records interest in the browser and nothing else.
- **PDPL compliance** — children's data is sensitive under Egypt's PDPL. DPO,
  consent capture and the PDPC licence gate go in before any real student
  record exists.
- **Arabic** — the stylesheet uses logical properties throughout and
  Settings has an RTL layout preview, but no copy is translated.

## Reporting discipline

Income figures are treated as a legal surface, not a marketing one. Anywhere
they appear, `n`, the median and the % earning zero are shown together — never
an average, never a best case. The Income & ROI page carries the guardrail
above the numbers, and the parent dashboard states plainly what is not
promised.

## Layout of the source

```
src/
  lib/          types · seed (deterministic) · store · formatters
  components/
    ui/         primitives — modal, drawer, menu, tabs, toasts, stat, charts
    layout/     app shell, sidebar, topbar, role switcher, command palette
  roles/
    admin/      overview, sessions list, people, curriculum, cohorts, outcomes
      editor/   session editor and its four panels
    marketplace/ cover art, the catalogue grid and the listing page —
                 one set of components, two family-facing roles
    student/    missions tree, session view, annotation canvas, marketplace
    instructor/ parent/
  index.css     the whole design system — tokens, components, no Tailwind
```

Charts are hand-rolled inline SVG; there is no charting dependency. The only
runtime deps are React, React Router, Zustand, lucide-react and the Inter
font.
