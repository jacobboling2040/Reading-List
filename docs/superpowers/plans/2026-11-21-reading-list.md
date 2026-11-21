# Friends' Reading List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an invite-only web app where friends keep their own shelves, review books, follow each other, and discover books on a For You page built from the people they follow.

**Architecture:** A server-rendered SvelteKit app deployed to Vercel. Domain logic lives in plain TypeScript modules under `src/lib/server/`. Every domain function takes a `db` handle as its first argument, so it can be unit-tested against an in-memory libSQL database. Routes are thin `+page.server.ts` load functions and form actions that call those modules. Auth is built into the app: argon2id password hashes, and opaque session tokens whose SHA-256 hashes are stored in the database.

**Tech Stack:** SvelteKit 2 + Svelte 5, TypeScript, `@sveltejs/adapter-vercel`, Turso via `@libsql/client`, Drizzle ORM + drizzle-kit, `@node-rs/argon2`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-reading-list-design.md`

## Global Constraints

- Joining is invite-only. There is no open sign-up route.
- Invites are single-use and expire **7 days** after creation. The app records `invited_by`.
- Password hashing uses **argon2id**. Session cookies are `httpOnly`, `secure`, `sameSite: 'lax'`.
- Every route except `/login`, `/join/[token]`, `/reset/[token]`, and `/robots.txt` requires a session.
- Every response carries the header `X-Robots-Tag: noindex, nofollow`. `robots.txt` is `User-agent: *\nDisallow: /`.
- No third-party scripts, analytics or fonts from CDNs. The only outside calls are `openlibrary.org` search and `covers.openlibrary.org` images.
- Follower and following counts are never rendered anywhere.
- Every For You card shows why it's there: the followed people who rated it, with their stars.
- Ratings are integers 1–5. Review text is optional.
- Shelf status is exactly one of `to_read | reading | finished`.
- Deactivated users are hidden everywhere (profiles, People, reviews, to-read lists, For You) and cannot sign in.
- The configuration comes only from these environment variables: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- Cost is $0: stay within the Vercel Hobby and Turso free tiers. Nothing runs on the owner's home hardware.

Decisions this plan adds (the builder's calls, within the spec):
- Usernames: 3–20 characters `[a-z0-9_]`, stored lowercase, unique without regard to case.
- Display names: 1–40 characters. Passwords: at least 10 characters.
- Sessions last 30 days and are renewed when fewer than 15 days remain.
- The spec's "session secret" isn't needed, because tokens are random and stored hashed.
- Login rate limit: 5 failed attempts per username, or 20 per IP, within 15 minutes, is blocked. Attempts are stored in the database because serverless functions have no shared memory.
- Password reset links are single-use and expire after 24 hours.
- Saving a review for a book you haven't shelved puts it on Finished. Reviews are independent of shelf moves after that.
- The For You score is `lovers + max(0, 1 - ageDays/30)`, where `ageDays` is the age of the newest loving review. Ties go to the newest review.
- Backups are a SQL dump (schema plus INSERTs) of every table except `sessions` and `login_attempts`.
- The first admin is created with a CLI script, because no invite can exist yet.

## Review Focus

1. **An invite token is redeemed twice at once, or redeemed after it expired or was revoked.** Exactly one account is created, and later attempts get "This invite link has expired or was already used." (Task 3)
2. **A member is deactivated while signed in.** Their next request is signed out. Their reviews disappear from book pages, and their ratings stop counting on everyone's For You. (Tasks 2, 7, 8)
3. **Open Library is slow, down, or returns results missing covers or authors.** Search shows "Book search is unavailable right now. You can add it manually." after a 5-second timeout. Results without covers render a placeholder, and missing authors become an empty list. (Task 5)
4. **"Sam" signs up when "sam" exists.** The join is rejected with "That username is taken." (Task 3)
5. **Someone tries to follow themselves, or to view a deactivated user's profile by URL.** The self-follow is a no-op error, and the profile returns 404. (Task 7)

---

## File Structure

```
src/
  hooks.server.ts                 session load, auth guard, noindex header
  app.d.ts                        App.Locals { user: SessionUser | null }
  lib/server/
    db/schema.ts                  Drizzle tables
    db/client.ts                  getDb() from env
    db/test-db.ts                 createTestDb() in-memory + migrations
    auth/password.ts              hashPassword / verifyPassword
    auth/session.ts               create/validate/invalidate sessions
    auth/rate-limit.ts            login attempt limiting
    auth/guard.ts                 isPublicPath, requireAdmin
    users.ts                      users, invites, resets, deactivation, deletion
    books.ts                      Open Library search + book records
    shelves.ts                    shelf entries
    reviews.ts                    reviews
    follows.ts                    follows, people, profiles
    for-you.ts                    For You candidates + ranking
    backup.ts                     SQL dump
  lib/components/                 BookCard.svelte, Stars.svelte, Cover.svelte, Nav.svelte
  routes/
    +layout.svelte, +layout.server.ts
    login/, logout/, join/[token]/, reset/[token]/, robots.txt/
    (app)/+page                   For You
    (app)/search/, (app)/books/[id]/, (app)/shelves/,
    (app)/people/, (app)/u/[username]/, (app)/invite/, (app)/settings/
    (app)/admin/, (app)/admin/backup/
scripts/create-admin.ts
drizzle/                          generated migrations
tests/unit/*.test.ts              Vitest
tests/e2e/smoke.spec.ts           Playwright
```

---

### Task 1: Scaffold, schema, test database

**Files:**
- Create: the SvelteKit project at the repo root, `src/lib/server/db/schema.ts`, `src/lib/server/db/client.ts`, `src/lib/server/db/test-db.ts`, `drizzle.config.ts`, `drizzle/` (generated), `.gitignore`, `.env.example`
- Test: `tests/unit/schema.test.ts`

**Interfaces:**
- Produces:
  - `type Db = LibSQLDatabase<typeof schema>`
  - `getDb(): Db`: a lazy singleton built from `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. It defaults to `file:local.db` when the URL is unset.
  - `createTestDb(): Promise<Db>`: an `:memory:` client with migrations applied from `./drizzle`.
  - The tables below, exported from `schema.ts`. Ids are integer autoincrement unless noted. Timestamps are integer unix milliseconds.
    - `users(id, username UNIQUE, displayName, passwordHash, isAdmin bool default false, invitedBy → users.id ON DELETE SET NULL, createdAt, deactivatedAt nullable)`
    - `invites(token text PK, createdBy → users.id ON DELETE CASCADE, createdAt, expiresAt, usedBy nullable → users.id ON DELETE SET NULL, usedAt nullable, revokedAt nullable)`
    - `sessions(idHash text PK, userId → users.id ON DELETE CASCADE, expiresAt)`
    - `passwordResets(tokenHash text PK, userId → users.id ON DELETE CASCADE, expiresAt, usedAt nullable)`
    - `loginAttempts(id, username, ip, at)`
    - `books(id, olWorkId UNIQUE nullable, title, authors text (JSON array), coverId int nullable, year int nullable, createdBy nullable → users.id ON DELETE SET NULL)`
    - `shelfEntries(userId → users CASCADE, bookId → books CASCADE, status text, updatedAt)`, with a unique key on `(userId, bookId)`
    - `reviews(id, userId → users CASCADE, bookId → books CASCADE, rating int, body text nullable, createdAt, updatedAt)`, with a unique key on `(userId, bookId)` and a CHECK that `rating BETWEEN 1 AND 5`
    - `follows(followerId → users CASCADE, followeeId → users CASCADE, createdAt)`, with a PK on `(followerId, followeeId)` and a CHECK that `followerId != followeeId`
    - `dismissals(userId → users CASCADE, bookId → books CASCADE)`, with a PK on `(userId, bookId)`

- [ ] **Step 1: Scaffold.** Run `git init`, then `npx sv create . --template minimal --types ts`, and add Vitest and Playwright. Install `@sveltejs/adapter-vercel @libsql/client drizzle-orm @node-rs/argon2` and the dev dependency `drizzle-kit`. Set `adapter-vercel` with `runtime: 'nodejs22.x'` in `svelte.config.js`. Turn on foreign keys in both clients by running `PRAGMA foreign_keys = ON` after the client is created.
- [ ] **Step 2: Write the failing test** `tests/unit/schema.test.ts`:
  - `rejects a second shelf entry for the same user and book`: inserting two rows with the same pair throws.
  - `rejects rating 0 and 6`: both inserts throw.
  - `rejects self-follow`: the insert throws.
  - `deleting a user cascades to shelf entries, reviews, follows and nulls invitedBy`: after the delete, those rows have counts of 0, and the invitee's `invitedBy` is `null`.
- [ ] **Step 3: Run** `npx vitest run tests/unit/schema.test.ts`. Expected: FAIL because the modules don't exist.
- [ ] **Step 4: Write the schema and clients, then run** `npx drizzle-kit generate`.
- [ ] **Step 5: Run the test again.** Expected: PASS.
- [ ] **Step 6: Commit** with `feat: scaffold app and database schema`.

### Task 2: Passwords, sessions, rate limiting, guard

**Files:**
- Create: `src/lib/server/auth/password.ts`, `session.ts`, `rate-limit.ts`, `guard.ts`, `src/hooks.server.ts`, `src/app.d.ts`, `src/routes/robots.txt/+server.ts`
- Test: `tests/unit/auth.test.ts`

**Interfaces:**
- Consumes: `Db` and `createTestDb` (Task 1)
- Produces:
  - `hashPassword(pw: string): Promise<string>` and `verifyPassword(hash: string, pw: string): Promise<boolean>`, using argon2id defaults from `@node-rs/argon2`.
  - `type SessionUser = { id: number; username: string; displayName: string; isAdmin: boolean }`
  - `createSession(db, userId: number): Promise<{ token: string; expiresAt: number }>`. The token is 32 random bytes in base64url, and the database stores `sha256(token)`.
  - `validateSession(db, token: string): Promise<{ user: SessionUser; expiresAt: number } | null>`. It returns null when the session is expired or the user is deactivated, and deletes an expired row. It extends the session to 30 days when fewer than 15 days remain.
  - `invalidateSession(db, token)` and `invalidateUserSessions(db, userId)`
  - `SESSION_COOKIE = 'session'` and `setSessionCookie(cookies, token, expiresAt)`
  - `checkLoginAllowed(db, username, ip, now?): Promise<boolean>` and `recordFailedLogin(db, username, ip, now?)`
  - `isPublicPath(pathname: string): boolean`, which is true for `/login`, `/join/*`, `/reset/*` and `/robots.txt`
  - `requireAdmin(locals): SessionUser`, which throws a 404 `error` for anyone who isn't an admin
- [ ] **Step 1: Write the failing tests:**
  - `hash then verify` returns true for the right password and false for a wrong one.
  - `validateSession returns user for fresh token`.
  - `validateSession returns null after expiry` (with time faked).
  - `validateSession returns null once user is deactivated`.
  - `session renewed when <15 days left`: the returned `expiresAt` is now + 30 days.
  - `6th failed attempt for a username within 15 min is blocked`, `21st for an ip is blocked`, and `allowed again after 15 min`.
  - `isPublicPath`: `/login`, `/join/abc` and `/robots.txt` are true; `/`, `/admin` and `/u/sam` are false.
- [ ] **Step 2: Run** `npx vitest run tests/unit/auth.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the modules.** `hooks.server.ts` reads the cookie, sets `locals.user`, and redirects with a 303 to `/login?next=<path>` when the path isn't public and there's no user. It sets `X-Robots-Tag: noindex, nofollow` on every response. `robots.txt` returns `User-agent: *\nDisallow: /`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: password hashing, sessions, rate limiting, auth guard`.

### Task 3: Users, invites, password resets, admin bootstrap

**Files:**
- Create: `src/lib/server/users.ts`, `scripts/create-admin.ts`
- Test: `tests/unit/users.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2
- Produces:
  - `class UserError extends Error`, whose `message` is the copy shown to users
  - `validateSignup(input: { username; displayName; password }): string | null`, which returns the first error message or null
  - `createUser(db, { username, displayName, password, isAdmin?, invitedBy? }): Promise<number>`
  - `createInvite(db, createdBy: number, now?): Promise<string>`
  - `listInvites(db, createdBy: number)`, which returns pending invites (unused, unrevoked, unexpired)
  - `revokeInvite(db, token, byUserId)`, allowed for the creator or an admin
  - `redeemInvite(db, token, signup): Promise<number>`, which runs in one transaction with a conditional `UPDATE invites SET used_by=? , used_at=? WHERE token=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`. If no row changed, it throws `UserError('This invite link has expired or was already used.')`.
  - `getInvite(db, token)`, which returns `{ valid: boolean }` for the join page
  - `authenticate(db, username, password): Promise<SessionUser | null>`. It's case-insensitive and returns null for deactivated users.
  - `createPasswordReset(db, userId): Promise<string>`, valid for 24 hours
  - `resetPassword(db, token, newPassword)`, which is single-use and calls `invalidateUserSessions`
  - `setDeactivated(db, userId, deactivated: boolean)`, which also invalidates sessions when deactivating
  - `deleteAccount(db, userId)`, which deletes the user row (cascades do the rest) and the user's unused invites
- Copy:
  - `Username must be 3–20 characters: lowercase letters, numbers, or _.`
  - `Display name must be 1–40 characters.`
  - `Password must be at least 10 characters.`
  - `That username is taken.`
- [ ] **Step 1: Write the failing tests:**
  - `redeemInvite creates user with invitedBy set`.
  - `second redeem of same token throws expired/used message`.
  - `Promise.all of two redeems creates exactly one user`.
  - `expired invite (8 days) rejected`.
  - `revoked invite rejected`.
  - `"Sam" rejected when "sam" exists` (case-insensitive check).
  - `authenticate is case-insensitive on username`.
  - `deactivated user cannot authenticate and sessions are gone`.
  - `reset token works once, then fails; old sessions invalidated`.
  - `deleteAccount removes reviews/shelves/follows/dismissals and unused invites; books remain`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/users.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `users.ts`.** Then write `scripts/create-admin.ts`, run as `npx tsx scripts/create-admin.ts <username> <display name>`. It prompts for a password, then calls `createUser` with `isAdmin: true`. It refuses to run if an admin already exists.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: users, invites, password resets, admin bootstrap`.

### Task 4: Auth pages

**Files:**
- Create: `src/routes/login/+page.svelte` and `+page.server.ts`, `src/routes/logout/+page.server.ts`, `src/routes/join/[token]/*`, `src/routes/reset/[token]/*`, `src/routes/+layout.svelte`, `src/lib/components/Nav.svelte`
- Test: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3
- Behavior:
  - The login action calls `checkLoginAllowed`, then `authenticate`. On failure it calls `recordFailedLogin` and returns `fail(400, { message: 'Wrong username or password.' })`. When blocked, it returns `Too many attempts. Try again in 15 minutes.` On success it sets the cookie and redirects with a 303 to a `next` value that is a same-origin path starting with `/`. Otherwise it redirects to `/`.
  - The join page shows `This invite link has expired or was already used.` when the invite isn't valid. On success it signs the user in and redirects to `/people`, so they can follow friends straight away.
  - The reset page sets a new password, then redirects to `/login` with a notice.
  - Logout is a POST-only action that invalidates the session and redirects to `/login`.
  - The nav shows For You, Search, Shelves, People, Invite, Settings, and Admin (admins only).
- [ ] **Step 1: Write the failing e2e tests** against a dev server using `TURSO_DATABASE_URL=file:test-e2e.db`, seeded by a Playwright `globalSetup` that creates an admin and one invite:
  - `unauthenticated / redirects to /login`.
  - `join with invite → lands on /people`.
  - `reusing invite shows expired message`.
  - `wrong password shows error`.
  - `next=https://evil.example is ignored`.
  - `GET /robots.txt disallows all`, and `responses have X-Robots-Tag`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/auth.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the pages** with SvelteKit form actions and `use:enhance`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: login, join, reset, logout pages`.

### Task 5: Books and Open Library

**Files:**
- Create: `src/lib/server/books.ts`
- Test: `tests/unit/books.test.ts`

**Interfaces:**
- Produces:
  - `type SearchResult = { olWorkId: string; title: string; authors: string[]; coverId: number | null; year: number | null }`
  - `searchOpenLibrary(q: string, fetchFn = fetch): Promise<SearchResult[]>`. It calls `https://openlibrary.org/search.json?q=<q>&fields=key,title,author_name,cover_i,first_publish_year&limit=20` with a 5-second `AbortSignal.timeout`. It maps `key` `/works/OL123W` to `OL123W`. Any network or HTTP failure throws `UserError('Book search is unavailable right now. You can add it manually.')`.
  - `upsertOpenLibraryBook(db, r: SearchResult, userId): Promise<number>`, which returns the existing id when `olWorkId` is already stored
  - `addManualBook(db, { title, author }, userId): Promise<number>`. The title is 1–200 characters and the author 1–100.
  - `type Book = { id; olWorkId; title; authors: string[]; coverId; year }`
  - `getBook(db, id): Promise<Book | null>`
  - `coverUrl(coverId: number | null, size: 'S'|'M'|'L'): string | null`, which returns `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`
- [ ] **Step 1: Write the failing tests** with a stubbed `fetchFn`:
  - `maps fields and strips /works/`.
  - `missing author_name → []`, and `missing cover_i → null`.
  - `HTTP 500 throws unavailable message`.
  - `timeout throws unavailable message`.
  - `upsert twice returns same id`.
  - `manual book with empty title rejected`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/books.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `books.ts`.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: Open Library search and book records`.

### Task 6: Shelves and reviews

**Files:**
- Create: `src/lib/server/shelves.ts`, `src/lib/server/reviews.ts`
- Test: `tests/unit/shelves-reviews.test.ts`

**Interfaces:**
- Produces:
  - `type ShelfStatus = 'to_read' | 'reading' | 'finished'`
  - `setShelf(db, userId, bookId, status: ShelfStatus)`, an upsert that also sets `updatedAt`
  - `removeFromShelf(db, userId, bookId)`
  - `getShelfStatus(db, userId, bookId): Promise<ShelfStatus | null>`
  - `listShelf(db, userId, status): Promise<(Book & { updatedAt })[]>`, newest first
  - `shelfCounts(db, userId): Promise<Record<ShelfStatus, number>>`
  - `saveReview(db, userId, bookId, { rating: number; body?: string })`. It's an upsert. It throws `UserError('Pick a rating from 1 to 5 stars.')` when the rating is out of range or not an integer, trims the body, and caps it at 5,000 characters. If the user hasn't shelved the book, it sets the shelf to `finished`.
  - `deleteReview(db, userId, bookId)`
  - `type ReviewView = { userId; username; displayName; rating; body; updatedAt }`
  - `listBookReviews(db, bookId): Promise<ReviewView[]>`, which excludes deactivated users and lists newest first
  - `listToReadMembers(db, bookId): Promise<{ username; displayName }[]>`, which excludes deactivated users
  - `listUserReviews(db, userId, limit = 10)`, which joins the book
- [ ] **Step 1: Write the failing tests:**
  - `setShelf moves between statuses (one row)`.
  - `saveReview on unshelved book shelves it as finished`.
  - `saveReview twice updates, one row`.
  - `rating 0, 6, 3.5 rejected with message`.
  - `deactivated user's review hidden from listBookReviews and their to-read hidden`.
  - `moving finished → to_read keeps review`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/shelves-reviews.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the modules.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: shelves and reviews`.

### Task 7: Follows, people, profiles

**Files:**
- Create: `src/lib/server/follows.ts`
- Test: `tests/unit/follows.test.ts`

**Interfaces:**
- Produces:
  - `follow(db, followerId, followeeId)`. It's idempotent, throws `UserError("You can't follow yourself.")` for a self-follow, and throws a 404 for a deactivated or missing followee.
  - `unfollow(db, followerId, followeeId)`
  - `isFollowing(db, a, b): Promise<boolean>`
  - `listMembers(db, viewerId): Promise<{ id; username; displayName; following: boolean }[]>`. It lists active users except the viewer, ordered by display name, without counts.
  - `getProfile(db, username): Promise<{ id; username; displayName; readingNow: Book[]; counts: Record<ShelfStatus, number>; recentReviews } | null>`. It returns null for a deactivated or missing user.
- [ ] **Step 1: Write the failing tests:**
  - `follow is idempotent`.
  - `self-follow throws message`.
  - `listMembers excludes viewer and deactivated, marks following`.
  - `getProfile null for deactivated`.
  - `profile counts match shelves`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/follows.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `follows.ts`.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: follows, member directory, profiles`.

### Task 8: For You

**Files:**
- Create: `src/lib/server/for-you.ts`
- Test: `tests/unit/for-you.test.ts`

**Interfaces:**
- Produces:
  - `type ForYouCard = { book: Book; lovers: { username; displayName; rating: 4 | 5 }[]; snippet: { displayName; body } | null; score: number; newestAt: number }`
  - `getForYou(db, userId, now = Date.now(), limit = 30): Promise<{ followsAnyone: boolean; cards: ForYouCard[] }>`
  - `dismiss(db, userId, bookId)`, which is idempotent
- Algorithm:
  1. Collect reviews with `rating >= 4` written by active users the viewer follows.
  2. Exclude books on any of the viewer's shelves, and books the viewer dismissed.
  3. Group the reviews by book.
  4. Score each book as `score = lovers.length + max(0, 1 - (now - newestAt) / (30 * 86_400_000))`.
  5. Sort by score descending, then by `newestAt` descending.
  6. For the snippet, use the newest loving review that has non-empty text, truncated to 140 characters with `…`.
- [ ] **Step 1: Write the failing tests:**
  - `only followed users count` (a 5★ review from a non-followed user is absent).
  - `ratings ≤3 ignored`.
  - `shelved and dismissed books excluded`.
  - `deactivated followee's ratings ignored`.
  - `two lovers outrank one fresh lover`.
  - `fresh review outranks 40-day-old review with same lover count`.
  - `followsAnyone false when following nobody`.
  - `snippet truncated at 140 chars`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/for-you.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `for-you.ts`.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: For You ranking`.

### Task 9: Reading pages (For You, search, book page, shelves)

**Files:**
- Create: `src/routes/(app)/+page.svelte` and `+page.server.ts`, `(app)/search/*`, `(app)/books/[id]/*`, `(app)/shelves/*`, `src/lib/components/BookCard.svelte`, `Stars.svelte`, `Cover.svelte`
- Test: `tests/e2e/reading.spec.ts`

**Interfaces:**
- Consumes: Tasks 5–8
- Behavior:
  - **For You:** renders cards per the spec sketch. The "To-read" action calls `setShelf(..., 'to_read')` and the "Not for me" action calls `dismiss`, and each removes the card.
  - **For You empty states:** `Follow some friends to see what they loved.` with a link to `/people`, or `Nothing new from the people you follow yet.`
  - **Search:** `?q=` runs `searchOpenLibrary`. Picking a result calls `upsertOpenLibraryBook`, then redirects to `/books/[id]`. A manual-add form is always visible below the results. The unavailable error message is shown inline.
  - **Book page:** cover, title, authors and year; a shelf status selector plus Remove; the average rating and number of reviewers; the review form (stars plus text, with edit and delete); everyone's reviews; and "On to-read:" members.
  - **Shelves:** tabs `?tab=to_read|reading|finished`. Setting a book to `finished` from any page redirects to `/books/[id]?review=1`, which focuses the review form with a "Skip" link.
  - **Cover:** renders `coverUrl` with `loading="lazy"`, or a neutral placeholder showing the title when there's no cover.
  - Layout works at 360px width with no horizontal scroll.
- [ ] **Step 1: Write the failing e2e tests.** Stub Open Library with `page.route('https://openlibrary.org/**', …)`.
  - `search, add, shelve as to-read appears on shelves`.
  - `mark finished prompts review; save review shows on book page`.
  - `friend's 5★ appears on follower's For You with "why" line; Not for me removes it`.
  - `search outage shows manual-add message`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/reading.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the pages and components.** Visual style: warm, bookish, with system fonts only (no font CDN).
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: For You, search, book and shelf pages`.

### Task 10: Social pages (people, profile, invite, settings)

**Files:**
- Create: `src/routes/(app)/people/*`, `(app)/u/[username]/*`, `(app)/invite/*`, `(app)/settings/*`
- Test: `tests/e2e/social.spec.ts`

**Interfaces:**
- Consumes: Tasks 3 and 7
- Behavior:
  - **People:** the member list with Follow/Unfollow buttons.
  - **Profile:** matches the spec sketch (Reading now, To-read (n), Finished (n), recent reviews, Follow). A missing or deactivated user gets a 404.
  - **Invite:** a "Create invite link" button shows the full URL (`${url.origin}/join/${token}`) with a Copy button, plus a list of pending invites with Revoke.
  - **Settings:** change the display name and password (the current password is required). **Delete account** requires typing your username, then calls `deleteAccount` and clears the cookie.
- [ ] **Step 1: Write the failing e2e tests:**
  - `follow from People then profile shows Unfollow`.
  - `profile page shows no follower counts` (the page text contains no "follower").
  - `create and revoke invite`.
  - `delete account signs out and username is free`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/social.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the pages.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: people, profiles, invites, settings`.

### Task 11: Admin and backup download

**Files:**
- Create: `src/lib/server/backup.ts`, `src/routes/(app)/admin/*`, `src/routes/(app)/admin/backup/+server.ts`
- Test: `tests/unit/backup.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3
- Produces:
  - `dumpDatabase(db): Promise<string>`. It writes `PRAGMA foreign_keys=OFF; BEGIN;`, then each `CREATE TABLE`/`CREATE INDEX` from `sqlite_master` (excluding `sqlite_%` and `__drizzle%`), then one `INSERT` per row with properly quoted values, then `COMMIT;`. It skips the rows of `sessions` and `login_attempts`, but keeps their CREATE statements.
- Behavior (every page calls `requireAdmin`):
  - **Members table:** active or deactivated status, with Deactivate/Reactivate and "Create reset link" (shows `${origin}/reset/${token}`).
  - **All pending invites,** with Revoke.
  - **Download backup:** `GET /admin/backup` returns the dump with `Content-Disposition: attachment; filename="reading-list-YYYY-MM-DD.sql"`.
- [ ] **Step 1: Write the failing tests:**
  - `dump restores into a fresh in-memory db with identical row counts`.
  - `dump contains no session rows`.
  - `values with quotes round-trip`.
  - E2e: `non-admin gets 404 on /admin and /admin/backup`, `deactivate signs that member out`, `reset link lets member set new password`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/backup.test.ts && npx playwright test tests/e2e/admin.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the backup module and admin pages.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: admin tools and backup download`.

### Task 12: Deploy to Vercel

**Files:**
- Create: `README.md` (setup, deploy, restore), `.env.example`
- Modify: `package.json` scripts: `db:generate`, `db:migrate`, `create-admin`, `test`, `test:e2e`

**Steps:**
- [ ] **Step 1: Run the full suite:** `npm run check && npx vitest run && npx playwright test`. Expected: everything passes, with 0 type errors.
- [ ] **Step 2: Write the README.** Cover:
  - Creating the Turso database: `turso db create reading-list`, `turso db show --url`, `turso db tokens create`.
  - `npm run db:migrate` against Turso.
  - Running `create-admin` against Turso.
  - Connecting the repo to Vercel and setting the two environment variables.
  - Restoring a backup: `turso db shell <db> < reading-list-YYYY-MM-DD.sql` into a fresh database.
- [ ] **Step 3: Verify** with `npm run build`. Expected: it succeeds with the Vercel adapter output.
- [ ] **Step 4: Commit** with `docs: setup and deploy guide`.
- [ ] **Step 5: Owner-run deploy.** The owner creates the Turso and Vercel accounts and links them. The builder does not create accounts or deploy without the owner.
