# Contributor guide (for agents and humans)

Read this before changing code. The [README](README.md) covers setup, deploys, backups and
configuration; this file covers how the code is laid out, the rules it follows, and how to land a
change.

## What this app is (and must stay)

A small, invite-only reading list for a circle of friends: shelves, reviews, follows and a For You
page built only from people you follow. The full intent lives in
[docs/superpowers/specs/](docs/superpowers/specs/). Treat its **anti-goals** as hard rules:

- Nothing public. Every route except `/login`, `/join/*`, `/reset/*` and `/robots.txt` requires a
  session (`src/lib/server/auth/guard.ts`). Every response carries `X-Robots-Tag: noindex, nofollow`.
- No analytics, tracking or third-party scripts. The only outside calls are Open Library search and
  `covers.openlibrary.org` images. System fonts only, no font CDN.
- No engagement mechanics (streaks, goals, visible follower counts, leaderboards).
- Every For You card says why it is there.
- Hosting is Vercel + Turso on free tiers. Never add anything that runs on the owner's own hardware.
- The repo is public: never commit secrets, `.env`, `.env.local` or `*.db` files.

Ask before adding a dependency; the bar is "clearly needed".

## Stack

SvelteKit 3 + Svelte 5 (runes forced on for project files), TypeScript strict, Drizzle ORM on
libSQL (local SQLite file in dev, Turso in production), `@sveltejs/adapter-vercel` pinned to
`nodejs22.x` in region `pdx1` (next to the Turso database). Passwords use argon2id via
`@node-rs/argon2`. Node 22.9+ is required (`engine-strict=true`).

## Layout

```
src/
  hooks.server.ts          theme cookies -> <html> attrs, then handleAuth (session, login redirect)
  app.css                  all design tokens (spacing, colour schemes, motion) and base styles
  lib/
    server/                server-only domain code; plain functions that take a `Db` first
      db/schema.ts         Drizzle schema (source of truth for migrations)
      db/client.ts         getDb(): lazy singleton; refuses to start on Vercel without TURSO_DATABASE_URL
      db/test-db.ts        createTestDb(): fresh in-memory DB with all migrations, for unit tests
      auth/                passwords, sessions, rate limit, guard, safe `next` redirects, hook
      books.ts shelves.ts reviews.ts follows.ts for-you.ts users.ts backup.ts search-cache.ts
      errors.ts            UserError: an error whose message is safe to show
      form-input.ts        routeId/formId/formStatus parsers and withUserErrors()
    components/            BookCard, Cover, ShelfTabs, Sidebar, Stars, ThemeToggle
    pending.ts             `use:pending`, a drop-in for `use:enhance` with busy state
    theme.ts               theme modes/schemes shared by server and browser
  routes/
    (app)/                 signed-in pages (For You, search, books, shelves, people, profiles,
                           invite, settings, admin)
    login/ join/ reset/ logout/ robots.txt/   public or auth-flow routes
drizzle/                   generated SQL migrations + meta journal (commit both)
scripts/                   migrate.ts, create-admin.ts (run with tsx, read .env)
tests/unit/                vitest, one file per server module
tests/e2e/                 Playwright specs, Open Library stub, seed helpers
docs/superpowers/          design specs and implementation plans (dated)
```

## Conventions

**Server code**
- Domain logic lives in `src/lib/server/*.ts` as functions whose first argument is a `Db`
  (`setShelf(db, userId, bookId, status)`). Route files stay thin: parse input, call the domain
  function, return data. This keeps logic unit-testable against `createTestDb()`.
- Keep `src/lib/server/` free of `$app/*` and `$env/*` imports: vitest runs without the SvelteKit
  plugin. Read config from `process.env` (only `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and the
  test-only `OPENLIBRARY_BASE_URL`).
- Imports between project files are relative (`'../../../lib/server/db/client'`), matching the rest
  of the codebase. `#lib/*` exists but is only used for static assets.
- Errors a member should see are thrown as `UserError` and turned into `fail(400, { message })` by
  wrapping the action body in `withUserErrors()`. Anything else is a bug and should propagate.
- Parse every route param and form field with the helpers in `form-input.ts` (`routeId`, `formId`,
  `formStatus`). Bad ids in a URL are a 404; bad ids in a form are a `UserError`.
- Admin-only routes call `requireAdmin(locals)`, which 404s (not 403s) for everyone else.
- Never trust client-sent book details. Open Library results are looked up server-side (via the
  search cache) before a book is stored.
- Deactivated members must be hidden everywhere (profiles, reviews, shelves, follows, For You).
  New queries that list people or their content need that filter; see existing queries in
  `users.ts`, `reviews.ts`, `follows.ts` and `for-you.ts`.
- Timestamps are integer milliseconds (`Date.now()`); functions that depend on time take a `now`
  parameter defaulting to `Date.now()` so tests can pin it.
- Don't rely on foreign-key cascades: the pragma is on for local files but has no effect over
  remote Turso. Delete dependent rows explicitly.

**UI**
- Pages must work with JavaScript off: forms are real `<form method="POST">` actions and navigation
  is real links. Enhance on top.
- Use `use:pending` (from `src/lib/pending.ts`) instead of `use:enhance` so the submit button shows a
  busy state and double submits are ignored.
- Use the tokens in `src/app.css` (`--space-*`, `--color-*`, `--radius-*`, `--dur`, `--dur-fast`,
  `--ease`). Don't hard-code colours: every colour must work in all four schemes (paper, sage,
  slate, plum) in both light and dark.
- Motion stays at or under ~200ms, never delays the user, and respects `prefers-reduced-motion`.
- Tap targets are at least `--tap` (44px). Check layouts at phone width.
- Theme is applied server-side from cookies so there is no flash; don't move it to client-only code.

**Formatting**: Prettier settings in `.prettierrc` (tabs, single quotes, no trailing commas, width
100). Comments explain *why*, not what.

## Database changes

1. Edit `src/lib/server/db/schema.ts`.
2. `npm run db:generate` to create a new file in `drizzle/` (commit the SQL and `drizzle/meta/`).
   Never edit or delete a migration that is already on `main`.
3. `npm run db:migrate` to apply it locally. Unit and e2e tests apply migrations themselves.
4. If a new table's rows should stay out of backups (like `sessions` and `login_attempts`), add it
   to `SCHEMA_ONLY` in `src/lib/server/backup.ts` and cover it in `tests/unit/backup.test.ts`.

## Testing

```sh
npm run check      # svelte-check + TypeScript; must be clean
npm test           # vitest unit tests (tests/unit)
npm run test:e2e   # Playwright (tests/e2e); first run may need `npx playwright install chromium`
```

- Every domain function change gets a unit test using `createTestDb()` (a fresh in-memory DB per
  test, in `beforeEach`). Write the failing test first.
- User-visible flows get an e2e spec. The e2e setup deletes and re-migrates `test-e2e.db`, seeds an
  admin (`tests/e2e/seed.ts`), starts an Open Library stub on port 4998 and the dev server on port
  5174, with one worker. Use `withE2eDb()` to read or seed the database from a spec; it sets a busy
  timeout because the dev server writes concurrently. Never hit the real Open Library from tests.
- Run all three commands and report their real output before claiming a change works.

## Landing a change

- Branch from `main`; never commit to `main` directly. Use worktrees for parallel work
  (`.claude/worktrees/` is local and untracked).
- Commit messages are conventional and in plain English: `feat:`, `fix:`, `perf:`, `refactor:`,
  `docs:`, `chore:`, `test:` followed by what changed from a member's point of view, e.g.
  `fix: keep sidebar open when Menu is tapped before hydration`.
- Open a PR to `main`. CODEOWNERS requests review from the owner; don't merge without it.
- Larger features start with a dated design in `docs/superpowers/specs/` and a plan in
  `docs/superpowers/plans/`, and the owner's approval of the design.
- Update the README when setup, configuration, deploy or backup steps change, and this file when a
  convention changes.
