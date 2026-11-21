# Friends' Reading List — Design

Date: 2026-11-21
Status: Approved by owner (2026-11-21)

## Intent

A small, personal web app where a circle of friends keep their own bookshelves
(to-read, reading, finished), review what they've read, and discover books
through a **For You** page made only from people they follow.

It grew out of conversations among friends who want to swap recommendations.
The guiding rule is **it must stay personal and small**. It should feel like
browsing your friends' shelves, not like using a platform. Goodreads and
StoryGraph already exist. This app is worth building because it is intimate,
private, and free of platform noise.

## Goals

- Each member has personal shelves: **To-read**, **Reading**, **Finished**.
- Members review books with a **1–5 star rating plus optional text**.
- Members **follow** each other (one-way, no approval step).
- A **For You** page surfaces books that people you follow loved.
- Joining is **invite-only**. Any member can create an invite link.
- It works well on phones in a browser. Nothing to install.
- It is hosted free on **Vercel** (Hobby plan) with a **Turso** (hosted SQLite)
  database.

## Non-goals (v1)

- Shared or group reading lists and book clubs. These are deferred, and may come back
  later as "groups".
- Comments or likes on reviews. *(my call: keeps v1 small; easy to add later)*
- Notifications and email. *(my call: avoids running an email service; see Accounts)*
- Importing from Goodreads or StoryGraph. *(my call: possible later via CSV)*
- Taste matching or ML recommendations.

## Anti-goals (would be a failure even if it works)

- Anything public: no public profiles, no pages visible to people who aren't members, no
  search-engine indexing.
- Ads, tracking, or analytics that send data to third parties.
- Engagement mechanics: streaks, reading goals with guilt, push spam, visible
  follower counts, leaderboards.
- An opaque feed. Every For You card must say why it's there.

## Constraints

- **Host:** Vercel Hobby (free, for non-commercial personal use). It is
  serverless, so there is no persistent local disk.
- **Database:** Turso free tier (libSQL, which is SQLite-compatible).
- **No self-hosting.** The owner does not want this to involve their Raspberry Pi
  or any home hardware in any way. That includes hosting, backups and cron jobs.
- **Security:** because the app is internet-reachable, login and sessions must
  be solid. The app must not show any member data to someone who isn't logged in.
- **Scale:** tens to low hundreds of members. A single process and a single SQLite file
  are enough.
- **Reliability:** some downtime is acceptable. Turso's built-in recovery plus
  on-demand admin exports are considered enough protection for data.
- **Cost:** $0, staying within the Vercel and Turso free tiers.

## Approaches considered

1. **Hosted web app + Supabase (Vercel + Supabase).** Lowest maintenance and free
   at this size, but it depends on two outside services and the data lives elsewhere.
2. **Self-hosted app + SQLite on the owner's Raspberry Pi via Tailscale Funnel.**
   Discussed and then rejected by the owner, who doesn't want the Pi involved.
3. **Firebase.** Its document database is a poor fit for the relational "books
   loved by people I follow that I haven't shelved" query. Rejected.

**Chosen (by the owner): host on Vercel, since it's free. The database is Turso,
which is my call.**

Turso rather than Supabase: SQLite is simple, and the whole database exports
to a single portable file. We write our own small auth layer, so accounts aren't
locked into a vendor. Supabase would tie accounts and data to Postgres and
Supabase Auth, which is more platform than this app needs.

## Product design

### Accounts and invites
- No open sign-up. A new account can only be created from an **invite link**.
- Any member can generate an invite link. *(my call: single-use links that
  expire after 7 days; the app records who invited whom)*
- Sign-in uses a **username and password**. *(my call: this avoids sending email
  and needing an email provider. Passwords are hashed with argon2id. Sessions use http-only, secure,
  same-site cookies. Login attempts are rate-limited.)*
- Password reset: the **admin** (the owner) can generate a one-time reset link
  and send it to the friend personally. *(my call)*
- The admin can also revoke invites and deactivate members.
- **Deactivating a member** hides them everywhere: their profile, reviews and shelf
  entries, their follows, and their influence on For You. Their sessions end. All
  their data is kept, so the admin can reactivate them. *(my call)*
- **Members can delete their own account.** This permanently removes their reviews,
  shelf entries, follows, dismissals and unused invites. Books stay, since they're
  shared records. `invited_by` on other users is set to null. *(my call, to fit the
  "personal, private" intent)*

### Books
- Members add books by **searching Open Library**. Picking a result stores a
  local book record (Open Library work ID, title, authors, cover ID, first
  publish year), so the same book is never duplicated.
- Covers load from `covers.openlibrary.org`. *(Builder may cache locally.)*
- If Open Library has no match, the member can add a book manually.
  *(my call: title and author only, no cover)*

### Shelves
- Each member can put a book in exactly one status: To-read, Reading, or Finished.
  Books can be moved or removed.
- Finishing a book prompts the member to rate or review it, which they can skip.

### Reviews
- One review per member per book: 1–5 stars (required) plus text (optional).
  It can be edited or deleted.
- Reviews are shown on the book page, and on the reviewer's profile.

### Following
- One-way follow and unfollow. There is a **People** page listing all members so you
  can find friends to follow.
- Follower and following counts are **not** shown publicly. *(per anti-goals)*

### For You
Candidate books are books that someone you follow rated **4 or 5 stars**, excluding
books that:
- are on any of your shelves, or
- you dismissed with **Not for me** (permanent, per user).

Ranking *(my call; the builder can tune the formula)*: score = number of followed
people who rated it 4–5★, plus a recency bonus that decays over about 30 days from
the newest of those reviews. Ties are broken by newest review.

Each card shows:
- the cover, title and author,
- which followed people loved it and their stars,
- one review snippet, and
- **[+ To-read]** and **[Not for me]**.

Empty state: if you follow no one, the page prompts you to follow people. If you
follow people but there are no candidates, it says so plainly.

### Screens
1. **For You** (home after login)
2. **Search / Add book**
3. **Book page**: details, your shelf status, everyone's reviews, which members
   have it on their to-read shelf
4. **My shelves**: tabs for To-read, Reading and Finished
5. **Profile**, your own or another member's: Reading now, shelves, recent
   reviews, Follow button
6. **People**: the member directory
7. **Invite**: generate and copy a link, and see your pending invites
8. **Sign-in / Join via invite / Reset password**
9. **Admin** (owner only): members, invites, reset links

Sketches agreed in conversation:

```
┌─ For You ────────────────────────────┐
│ [cover] Piranesi — Susanna Clarke    │
│  Sam ★★★★★ · Alex ★★★★               │
│  "Read it in two days."              │
│  [+ To-read]   [Not for me]          │
└──────────────────────────────────────┘

┌─ Riley's profile ─────── [Follow] ───┐
│ Reading now: Tomorrow, and Tomorrow… │
│ To-read (12)   Finished (34)         │
│ Recent: ★★★★★ Project Hail Mary      │
└──────────────────────────────────────┘
```

## Technical design (my calls unless noted)

- **App:** SvelteKit with `adapter-vercel`, server-rendered, with progressive
  enhancement so it loads quickly on phones.
- **Database:** Turso through `@libsql/client`, with Drizzle ORM and migrations.
  Local development uses a local SQLite file through the same client.
- **Auth:** implemented in the app (no auth vendor). Sessions are stored in the
  database.
- **Config:** the database URL and auth token, and the session secret, come from
  environment variables only.
- **Backups (chosen by owner: keep it minimal):** there is no scheduled backup job.
  - Turso's built-in point-in-time recovery is the safety net.
  - The admin page has a **Download backup** button that exports the whole database
    as a SQLite file or SQL dump, on demand.

- **Data model (outline):**
  - `users`: id, username, display_name, password_hash, is_admin,
    invited_by, created_at, deactivated_at
  - `invites`: token, created_by, created_at, expires_at, used_by, used_at
  - `sessions`
  - `books`: id, ol_work_id (unique, nullable for manual books), title, authors,
    cover_id, year
  - `shelf_entries`: user_id, book_id, status, updated_at (unique on user and book)
  - `reviews`: user_id, book_id, rating, body, created_at, updated_at (unique on
    user and book)
  - `follows`: follower_id, followee_id, created_at
  - `dismissals`: user_id, book_id
- **Privacy:** every route except sign-in, join and reset requires a session.
  `robots.txt` disallows everything, and responses send `X-Robots-Tag: noindex`.
  There are no third-party scripts. The only outside calls are Open Library search
  and covers.

## Left to the builder

- Visual design, within the "personal, warm, not a platform" brief.
- Exact For You scoring constants.
- Whether to cache covers locally.
- Test strategy and deployment scripting.

## Open with the owner

- None blocking v1.
