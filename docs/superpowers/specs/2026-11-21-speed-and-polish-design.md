# Speed and polish: design

Date: 2026-11-21

## Intent

The app works but feels slow and dated. Search, adding a book, and switching tabs each take about a
second, both locally and on Vercel. The top bar is too busy (eight links plus log out, which wraps on
phones). There is no motion or click feedback, so the app feels unresponsive even when it is working.
The goal is an app that feels instant and calm, without changing its warm paper-and-ink look.

## Goals

1. Search, add, and tab switches feel near-instant (well under the current ~1s).
2. Search runs as you type.
3. Adding a book from search asks which shelf it goes on, and leaves you on the search page.
4. The top bar is replaced by a hamburger button that opens a slide-out sidebar, on every screen size.
5. The sidebar holds only the main destinations. Invite, Admin, and Log out move to another screen.
6. Quick, subtle animations on tab switches and page changes.
7. Every button gives visible feedback when pressed.
8. A light / dark / system theme toggle, plus a few extra colour schemes.
9. Mobile layout is fixed; the top bar was the main mobile problem.

## Non-goals

- Changing the overall visual identity (serif headings, warm palette stay as the default scheme).
- New features beyond what is listed (no offline mode, no PWA, no infinite scroll).
- Replacing Open Library as the book source.
- Moving the Turso database.

## Anti-goals (would be a failure even if it technically works)

- Flashy or slow animation. Nothing over ~200ms, and nothing that delays the user.
- A theme that flashes the wrong colours on page load.
- Breaking the app when JavaScript is off or slow to load: search, add, shelf moves and navigation
  must still work as plain forms and links.
- Ignoring the "reduce motion" system setting.

## Constraints

- SvelteKit 3 + Svelte 5 (runes), Drizzle on libSQL/Turso, deployed with `@sveltejs/adapter-vercel`.
- No new dependencies unless clearly needed. System fonts only.
- Existing unit tests (vitest) and e2e tests (Playwright, with an Open Library stub) must keep
  passing; update them where behaviour changes on purpose.
- Public repo. No secrets in code.

## What we found

- **Region mismatch.** Vercel functions run in the default US East region (`iad1`); Turso is in US
  West. Every request runs several sequential queries (session check, then page queries), each paying a
  cross-country round trip (~60–70ms each).
- **Local dev also talks to remote Turso.** `.env` sets `TURSO_DATABASE_URL` to a `libsql://` URL, so
  local dev is slow for the same reason. That's why it was slow "both" places.
- **Search** calls Open Library live on every page load (up to a 5s timeout). Open Library itself is
  often slow (0.5–2s).
- **Add** re-runs the same Open Library search to get trusted book details (`search/+page.server.ts`,
  `add` action), then redirects to the book page, which loads more data. That's two Open Library calls
  plus a full page load.
- **Shelf tabs** are links to `/shelves?tab=…`, so each switch is a full server request with a session
  check and two queries.
- **Nav** is `src/lib/components/Nav.svelte`: eight links in a wrapping flex row.
- **Theme** is set only by `prefers-color-scheme` in `src/app.css`, with tokens on `:root`.

## Approaches considered

**Shelf tabs**
- *Load all three shelves at once, switch on the client* (picked). One request for the page; switching
  is instant and can animate. Shelves are small (one person's books), so the extra data is fine. The
  URL still updates (`?tab=`) so links and refresh keep working.
- *Keep per-tab requests, preload on hover/tap.* Simpler, but still a server round trip per switch.

**Avoiding the second Open Library call on add**
- *Cache Open Library results in the database* (picked). A new table stores search results by
  normalised query for a day. Search-as-you-type and repeat searches hit the cache. The add action
  looks up the picked work in the cached results, and only calls Open Library again on a cache miss.
  Results stay server-trusted.
- *Sign the result payload and send it with the form.* Avoids the lookup but needs a new secret and
  more moving parts.
- *Trust client-sent details.* Rejected: the original design deliberately prevents members storing
  made-up details under a real work id.

**Theme persistence**
- *Cookie, applied on the server* (picked). The server sets `data-theme` and `data-scheme` on
  `<html>` before sending the page, so there is never a flash. Per device, which suits a theme setting.
- *Saved per user in the database.* Follows you across devices but needs a migration, and still needs
  a cookie to avoid the flash.

**Overall:** fix things in place in the existing SvelteKit app. A rewrite or a client-side data
layer would be far more work for no extra benefit.

## Design

### 1. Speed

- **Region.** Pin Vercel functions to `pdx1` (Portland) via the adapter's `regions` option in
  `vite.config.ts`. The Turso database `reading-list` is confirmed in `aws-us-west-2` (Oregon), so this
  puts functions and data in the same area.
- **Search cache.** New table `ol_search_cache(query TEXT PRIMARY KEY, results TEXT NOT NULL,
  fetched_at INTEGER NOT NULL)`, plus a Drizzle migration. `searchOpenLibrary` is wrapped by a cached
  version: normalise the query (trim, lowercase, collapse spaces), return cached results if under 24h
  old, otherwise fetch, store, and return. Failures are not cached.
- **Search as you type.** The search input updates results after a ~300ms pause, at 2+ characters,
  by navigating to `/search?q=…` with `replaceState`, `keepFocus` and `noScroll` so the URL stays
  shareable and the server-rendered page still works without JS. Stale requests are dropped (only the
  latest query's results render). The Search button stays for no-JS use.
- **Add with shelf choice.** Each result gets a shelf choice (To read / Reading / Finished) and an
  Add button. The `add` action finds the work in the cached results for that query (falling back to a
  fresh search), upserts the book, puts it on the chosen shelf, and returns success instead of
  redirecting. The result row then shows "Added to <shelf>" with a link to the book. *(Builder's call:)*
  results that are already on one of your shelves say so as soon as they load ("On your Reading
  shelf"). The search `load` does one extra indexed query for your shelf entries matching the
  results' work ids. Picking a different shelf and pressing Add moves the book. Choosing "Finished" keeps the existing review prompt as
  a link ("Write a review") rather than forcing a redirect.
- **Manual add** also gets the shelf choice. It still goes to the book page afterwards (there's no
  result list to stay on).
- **Shelf tabs.** `/shelves` loads all three shelves in one go (a single query grouped by status, or
  three in parallel) and switches tabs on the client. Tab clicks update `?tab=` with `replaceState`.
  Moving a book between shelves updates the lists in place, except a move to Finished, which keeps
  today's redirect to the book page with the review prompt (user's decision; same on the book page).
  *(Builder's call:)* a friend's profile
  shelves (`/u/[username]?tab=…`) work the same way, through a shared tab component, so tabs
  behave the same everywhere.
- **Page-to-page navigation.** Keep `data-sveltekit-preload-data="hover"`, and add tap preloading for
  the sidebar links so phones get the same head start. With the region fix, each page's server
  round trip drops from ~1s to roughly 100–200ms.
- **Local dev.** Document in the README that local dev against remote Turso will always pay network
  latency, and how to use a local `file:` database instead (unset `TURSO_DATABASE_URL`, run
  `npm run db:migrate`).

### 2. Navigation

- A slim top bar: hamburger button on the left, "Reading List" brand in the middle or next to it.
  Nothing else.
- The hamburger opens a sidebar that slides in from the left over the page, with a dimmed backdrop.
  It closes on backdrop click, Escape, link click, or the close button. Focus moves into the sidebar
  when it opens, stays inside while open, and returns to the hamburger when it closes. The button has
  `aria-expanded` and `aria-controls`.
- Sidebar links: For You, Search, Shelves, People, Profile, then a separator and Settings. The
  current page is highlighted as today.
- **Invite, Admin and Log out move to the Settings page**, under a "More" section: an Invite link,
  an Admin link (admins only), and the Log out button. The routes themselves stay where they are.
- On small screens the sidebar is most of the screen width (max ~20rem). Same behaviour on desktop.

### 3. Motion and feedback

- **Shared tokens:** `--ease` and `--dur-fast: 120ms`, `--dur: 180ms` in `app.css`.
- **Button press effect:** every `button` and button-styled link gets a quick scale-down
  (`transform: scale(0.97)`) and slight darken on `:active`.
- **Pending state:** while an enhanced form is submitting, its submit button shows a busy state (dimmed
  with a small spinner, `aria-busy="true"`) and ignores repeat clicks. One small shared helper wraps
  `use:enhance` so every form gets this without repeated code.
- **Shelf tabs:** the active underline slides between tabs; the list crossfades.
- **Page changes:** a quick crossfade using the View Transitions API (`onNavigate` in the root
  layout). Browsers without it just navigate as today.
- **Sidebar:** slides in and out, with the backdrop fading.
- **Reduce motion:** under `prefers-reduced-motion: reduce`, all of the above become instant (the
  press darken can stay, since it isn't motion).

### 4. Themes

- **Mode:** Light, Dark, or System (follows the device; the default).
- **Colour schemes:** Paper (today's palette, the default) plus three more: Sage (soft green), Slate
  (cool blue-grey), and Plum (muted purple). Each has a light and a dark version and must keep text
  contrast at WCAG AA. *(Names and colours are the builder's call; the user asked for "more colour
  schemes" without naming any.)*
- Tokens move from bare `:root` to `:root[data-scheme=…][data-theme=…]` rules, with System handled by
  `prefers-color-scheme` when `data-theme="system"`.
- Choices are stored in two cookies (`theme`, `scheme`; one year; not HTTP-only so the page can update
  them). `hooks.server.ts` reads them and sets the attributes on `<html>` via `transformPageChunk`,
  so the first paint is correct.
- **Controls:** a quick light/dark toggle button in the sidebar (cycles System → Light → Dark), and a
  full picker (mode + scheme, with small swatches) on the Settings page. Changes apply immediately,
  without a reload.

## Left to the builder

- Exact scheme colours, the spinner's look, and the exact easing curve.
- Whether shelf data loads as one grouped query or three parallel ones.
- Exact debounce (250–350ms) and how stale searches are dropped.
- Test coverage for the new behaviour: unit tests for the search cache and the add-to-shelf action,
  and e2e tests for search-as-you-type, add with shelf choice, sidebar open/close/focus, tab switching,
  and theme persistence across reloads.

## Work split

Four streams that can run in parallel, then one integration pass:

1. Speed: region, search cache, search-as-you-type, add-with-shelf, shelf tabs.
2. Navigation: sidebar, moving Invite/Admin/Log out into Settings.
3. Motion and feedback: tokens, press effect, pending helper, view transitions, reduced motion.
4. Themes: tokens per scheme/mode, cookies + server attribute, toggle and picker.

Overlaps to watch: the sidebar (2) hosts the theme toggle (4) and has its own animation (3). The
shelf tabs (1) get animation from (3). Settings changes come from both (2) and (4).
