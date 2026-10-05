# FocusFlow

A focus-session engine, not a task manager. You open it, it has already decided
what you should work on, and the only interesting button starts a session.

**Status: Phase 1 — the walking skeleton.** One vertical slice works end to end:
sign up → quick add a task → Today shows the next action → start a focus session
with a required Definition of Done → pause, resume, reload, finish → a completion
moment → Today reflects the progress. Signing in on another device shows the same
state, because all of it lives on the server.

---

## Setup

### 1. Install

```bash
npm install
```

Node 24 or newer. No Docker, no local Supabase stack, no containers are required
to run the app.

### 2. Create a Supabase project

<https://supabase.com/dashboard> → **New project**. Then:

**Project Settings → API** — copy the Project URL and the `anon` public key into
`.env.local`:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both values are safe in the browser. Row Level Security is what protects the data,
which is why every table has it and every policy is written per operation.

**Authentication → Providers → Email** — turn **Confirm email** _off_. This MVP is
single-user and signup is expected to sign you straight in. No OAuth provider is
needed or used.

**Authentication → URL Configuration** — add `http://localhost:3000/auth/callback`
(and your deployed equivalent) to the redirect allow-list, so password-reset links
work.

### 3. Run the migration

**SQL Editor → New query**, paste the contents of
[`supabase/migrations/0001_core.sql`](supabase/migrations/0001_core.sql), and run
it. It is idempotent-ish in the sense that it creates everything from scratch; run
it once, on a fresh project.

It creates five tables (`profiles`, `projects`, `milestones`, `tasks`,
`focus_sessions`), enables RLS on all of them with explicit per-operation policies,
and installs the trigger that creates a profile row when a user signs up.

### 4. Start

```bash
npm run dev
```

<http://localhost:3000> → you will be redirected to `/login`.

---

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server                                    |
| `npm run build`     | Production build                              |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm run lint`      | ESLint, including the `core/` purity boundary |
| `npm run test`      | Vitest over `core/**/*.spec.ts`               |
| `npm run check`     | All three of the above                        |

---

## Architecture

```
core/      Pure business rules. No React, no Next, no Supabase, no clock reads.
server/    Supabase access: Server Actions (writes) and query modules (reads).
app/       Routes. Server Components read; Server Actions and Route Handlers write.
components/ UI. Client Components only where interaction demands it.
hooks/     Client-side glue — notably the sampled server clock.
lib/       Supabase clients, env, small helpers.
```

Three rules do most of the work:

**`core/` is pure, and ESLint enforces it.** A `no-restricted-imports` rule fails
the build if anything in `core/` imports React, Next, Supabase or an app-layer
path. Every date rule takes `now` and the user's timezone as arguments, so the
tests can ask what happens at 23:55 on a DST boundary without mocking a clock.

**There is no repository layer.** `server/` talks to Supabase directly. Mappers
convert rows to domain shapes and nothing else — no caching, no query building.

**The timer has no counter.** `focus_sessions` stores `started_at`,
`last_resumed_at` and `accumulated_seconds`; elapsed time is _derived_ from those
on every render. `setInterval` only re-samples the clock, so a reload, a
backgrounded tab, a throttled iOS timer and a slept laptop all come back correct —
none of them can lose time that was never being counted. Every persisted timestamp
comes from the server; the browser's clock is only ever used, offset-corrected, to
paint between server responses.

Two database constraints turn product rules into things the system cannot get
wrong:

```sql
CHECK ((status = 'STARTED') = (last_resumed_at IS NOT NULL))
```

A paused session cannot have a running clock, so paused time is structurally
uncountable.

```sql
CREATE UNIQUE INDEX focus_sessions_one_live_per_user
  ON focus_sessions (user_id) WHERE status IN ('STARTED', 'PAUSED');
```

A second concurrent session is impossible. Two tabs racing to start produce a
unique violation, which the server turns into "you are already in a session" and a
redirect to it.

---

## Verifying the database

`supabase/verify/` holds an optional harness that runs the migration against a
throwaway Postgres container and asserts the constraints, the signup trigger and
cross-user RLS isolation. **The app never needs Docker** — this is a test tool.

```bash
./supabase/verify/run.sh
```

---

## Deploying

Vercel, with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`NEXT_PUBLIC_SITE_URL` set as environment variables. Add the deployed
`/auth/callback` URL to Supabase's redirect allow-list.

The app is installable on an iPhone (Share → Add to Home Screen), which removes
Safari's chrome from Focus Mode. There is no service worker and no offline support
yet — that is a later phase.

---

## Not built yet

Deliberately absent in Phase 1, and listed here so their absence reads as a
decision rather than an oversight: project detail and milestones UI, daily
planning ("Today's 3"), stuck recovery, AI task sizing and breakdown, the progress
page, tags, search, filtering, drag-and-drop reordering, notifications, and the
offline service worker.
