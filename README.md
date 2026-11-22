# Reading List

A small, invite-only site where friends shelve books (to read, reading, finished), rate and review
them, and follow each other. The For You page shows books the people you follow loved, with the
reason shown on each card. Built with SvelteKit 3 and libSQL (Turso), deployed on Vercel.

## Local quick start

```sh
npm install
cp .env.example .env        # optional; defaults to a local file database (local.db)
npm run db:migrate
npm run create-admin -- <username> "<Display Name>"   # prompts for a password
npm run dev
```

Open http://localhost:5173 and sign in. Make invite links from the Invite page and send them to
friends. Joining is invite-only; there is no public sign-up.

### Faster local development

With `TURSO_DATABASE_URL` set, local dev talks to the remote database and every query pays network
latency. To use a local file instead, comment out `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in
`.env`, run `npm run db:migrate`, then `npm run create-admin`.

## Tests

```sh
npm run check      # type check
npm test           # unit tests (vitest)
npm run test:e2e   # end-to-end tests (playwright)
```

The e2e run uses its own database (`test-e2e.db`), starts a stub Open Library server on port 4998
and the app on port 5174. It sets `OPENLIBRARY_BASE_URL`, a test-only override for the Open Library
base URL (default `https://openlibrary.org`); do not set it in production.

## Configuration

Only two environment variables (see `.env.example`):

- `TURSO_DATABASE_URL` : database URL (`file:local.db` locally, `libsql://...` on Turso)
- `TURSO_AUTH_TOKEN` : Turso auth token (empty for local files)

A `.env` file in the project root is picked up by `npm run dev`, `npm run db:migrate` and
`npm run create-admin` (the latter two use `tsx --env-file-if-exists=.env`, which needs Node 22.9 or
newer). Variables already set in your shell take precedence over `.env`. On Vercel the app refuses to
start without `TURSO_DATABASE_URL` rather than falling back to a local file.

## Turso setup

```sh
turso db create reading-list
turso db show reading-list --url          # -> TURSO_DATABASE_URL
turso db tokens create reading-list       # -> TURSO_AUTH_TOKEN
```

Apply the schema and create the first admin against Turso:

```sh
export TURSO_DATABASE_URL=libsql://...
export TURSO_AUTH_TOKEN=...
npm run db:migrate
npm run create-admin -- <username> "<Display Name>"
```

## Deploying to Vercel (for later, not done yet)

1. Push the repo and import it in Vercel.
2. Set the environment variables `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, and scope them to
   **Production only** (untick Preview and Development), so Preview deployments never touch the
   production database.
3. Use the Node 22 runtime (the adapter is configured for `nodejs22.x`).
4. Deploy, then sign in with the admin account created above.

Both Vercel Hobby and Turso free tiers are enough for this app.

## Backups and restore

Signed in as admin, use **Download backup** to get `reading-list-YYYY-MM-DD.sql`. It is a SQL dump
(schema plus INSERTs) of every table except `sessions` and `login_attempts`, and it includes the
`__drizzle_migrations` table, so a restored database is already migrated.

Restore into a **fresh, empty** database (restoring into one that already has tables will fail or
duplicate data):

```sh
turso db create reading-list-restored
turso db shell reading-list-restored < reading-list-YYYY-MM-DD.sql
turso db show reading-list-restored --url
turso db tokens create reading-list-restored
```

Then set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the new database's values (in Vercel, then
redeploy). Everyone will need to sign in again, since sessions are not backed up.

## Privacy

- Invite-only: invites are single-use and expire after 7 days.
- Every response sends `X-Robots-Tag: noindex, nofollow`, and `/robots.txt` disallows all crawlers.
- No analytics or third-party scripts. The only outside calls are Open Library search and cover
  images.
