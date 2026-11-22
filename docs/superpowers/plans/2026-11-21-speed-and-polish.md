# Speed and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make search, add and tab switching feel instant, replace the top bar with a slide-out sidebar, add subtle motion and press feedback, and add light/dark/system modes plus extra colour schemes.

**Architecture:** In-place changes to the existing SvelteKit 3 app. Speed comes from co-locating Vercel functions with Turso, a database cache of Open Library results, and loading all shelves at once. The sidebar uses the HTML `popover` attribute so it opens without JavaScript. Themes are two cookies read in `hooks.server.ts` and written onto `<html>` before the page is sent.

**Tech Stack:** SvelteKit 3, Svelte 5 runes, Drizzle ORM on libSQL/Turso, `@sveltejs/adapter-vercel`, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-speed-and-polish-design.md`

## Global Constraints

- No new npm dependencies. System fonts only.
- Nothing works only with JavaScript: search, add, shelf moves, navigation, the sidebar, and theme changes all work as plain forms and links. JavaScript only makes them faster or smoother.
- Animations last at most ~200ms and never delay input. Use the tokens `--ease: cubic-bezier(0.2, 0, 0, 1)`, `--dur-fast: 120ms`, `--dur: 180ms` (defined in Task 7). Before Task 7 lands, write `var(--dur, 180ms)` and similar so each task stands alone.
- Under `prefers-reduced-motion: reduce`, every transition and animation is instant.
- Moving a book to Finished (on `/shelves` and on `/books/[id]`) keeps redirecting to `/books/{id}?review=1`. Spec, user's decision.
- Shelf labels come from `SHELF_LABELS` in `src/lib/format.ts` ("To-read", "Reading", "Finished").
- Vercel region `pdx1`. Turso `reading-list` is in `aws-us-west-2`.
- Every text/background pair keeps WCAG AA contrast (4.5:1 for body text) in every scheme and mode.
- Run `npm run check`, `npm test`, and the e2e specs the task touches before each commit (`npx playwright test <spec>`).

## Review Focus

1. **Fast typing.** Responses can come back out of order. Only the latest query's results may ever render (Task 4 test: `stale search responses never replace newer results`).
2. **A tampered theme cookie** (`theme=<script>`) must never reach the HTML. Unknown values fall back to the defaults (Task 8 test: `parseThemePrefs rejects unknown values`).
3. **Open Library failing.** Failures are not cached, so the next try can succeed. An expired cache entry is refetched, not served (Task 2 tests).
4. **Adding after the cache expired** or for a query that was never cached still works through a fresh search, and a made-up work id is still refused (Task 3 tests).
5. **Sidebar focus.** Escape and link clicks close it, focus returns to the hamburger, and the page behind can't be tabbed into while it's open (Task 6 e2e: `sidebar opens, traps focus, closes on Escape`).

## File map

| File | Change | Task |
|---|---|---|
| `vite.config.ts`, `README.md` | region, local-dev note | 1 |
| `src/lib/server/db/schema.ts`, `drizzle/0001_*.sql` | `olSearchCache` table | 2 |
| `src/lib/server/search-cache.ts` (new) | cached search | 2 |
| `src/lib/server/shelves.ts` | `shelfStatusesForWorks`, `listAllShelves` | 3, 5 |
| `src/routes/(app)/search/*` | shelf choice, stay on page, as-you-type | 3, 4 |
| `src/lib/components/ShelfTabs.svelte` (new) | shared client tabs | 5 |
| `src/routes/(app)/shelves/*`, `src/routes/(app)/u/[username]/*` | all-shelves load, use `ShelfTabs` | 5 |
| `src/lib/components/Sidebar.svelte` (new, replaces `Nav.svelte`) | hamburger + popover sidebar | 6 |
| `src/routes/(app)/settings/+page.svelte` | "More" section; theme picker | 6, 8 |
| `src/app.css` | motion tokens, press effect, scheme tokens | 7, 8 |
| `src/routes/+layout.svelte` | view transitions | 7 |
| `src/lib/theme.ts` (new), `src/hooks.server.ts`, `src/app.html` | theme cookies → `<html>` | 8 |
| `src/routes/(app)/settings/theme/+server.ts` (new) | sets theme cookies | 8 |
| `src/lib/pending.ts` (new) | `use:enhance` with busy state | 10 |

## Execution order

- **Wave 1 (parallel):** Tasks 1, 2, 5, 6, 7, 8.
- **Wave 2:** Task 3 (after 2). Task 9 (after 6 and 8).
- **Wave 3:** Task 4 (after 3).
- **Wave 4:** Task 10 (after 3, 4, 5, 6; it touches every form).
- **Wave 5:** Task 11 (after everything).

Tasks 7 and 8 both edit `src/app.css` in separate sections. Task 7 owns everything from the `/* Motion */` comment onward; Task 8 owns the colour token blocks at the top.

---

### Task 1: Run functions next to the database

**Files:**
- Modify: `vite.config.ts` (adapter options)
- Modify: `README.md` (local development section)

- [ ] **Step 1:** Change the adapter call to `adapter({ runtime: 'nodejs22.x', regions: ['pdx1'] })`.
- [ ] **Step 2:** Run `npm run build`. Expected: succeeds. Then check `.vercel/output/functions/**/.vc-config.json` and confirm `"regions": ["pdx1"]` is in it.
- [ ] **Step 3:** In `README.md`, add a "Faster local development" note: with `TURSO_DATABASE_URL` set, local dev talks to the remote database and every query pays network latency. To use a local file instead, comment out `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env`, run `npm run db:migrate`, then `npm run create-admin`.
- [ ] **Step 4:** Commit: `perf: run Vercel functions in pdx1 next to Turso`.

### Task 2: Cache Open Library results in the database

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Create: `drizzle/0001_<generated>.sql` via `npm run db:generate`
- Create: `src/lib/server/search-cache.ts`
- Test: `tests/unit/search-cache.test.ts`

**Interfaces:**
- Consumes: `searchOpenLibrary(q, fetchFn, timeoutMs)` and `SearchResult` from `src/lib/server/books.ts`.
- Produces:
  - `olSearchCache` table: `query TEXT PRIMARY KEY`, `results TEXT NOT NULL` (JSON `SearchResult[]`), `fetchedAt INTEGER NOT NULL` (ms).
  - `normaliseQuery(q: string): string`: trim, lowercase, collapse runs of whitespace to one space.
  - `SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000`.
  - `cachedSearch(db: Db, q: string, opts?: { fetchFn?: typeof fetch; now?: number }): Promise<SearchResult[]>`. Returns `[]` for an empty normalised query without fetching. Serves a cache row younger than the TTL. Otherwise it calls `searchOpenLibrary`, upserts the row, and returns the results. A `UserError` from `searchOpenLibrary` propagates and nothing is written.

- [ ] **Step 1: Write the failing tests** in `tests/unit/search-cache.test.ts`, using `createTestDb()` and a counting fetch stub that returns one Dune doc (same shape as the stub in `tests/unit/books.test.ts`):
  - `normaliseQuery('  Le   GUIN ')` → `'le guin'`.
  - `serves a second identical search from cache`: two calls to `cachedSearch(db, 'Dune')` and `cachedSearch(db, ' dune ')` → stub called once, both results equal `[{ olWorkId: 'OL123W', title: 'Dune', ... }]`.
  - `refetches after the TTL`: first call at `now: 0`, second at `now: SEARCH_CACHE_TTL_MS + 1` → stub called twice.
  - `does not cache failures`: a stub returning status 500 → the first call rejects with the "unavailable" `UserError`. A second call with a good stub resolves to results, and the good stub is called once.
  - `empty query does not fetch`: `cachedSearch(db, '   ')` → `[]`, stub not called.
- [ ] **Step 2:** Run `npx vitest run tests/unit/search-cache.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Add `olSearchCache` to `schema.ts` and run `npm run db:generate`. Check the new SQL creates only `ol_search_cache`. Implement `search-cache.ts`, writing with `onConflictDoUpdate` on `query`.
- [ ] **Step 4:** Run `npx vitest run tests/unit/search-cache.test.ts` and `npm test`. Expected: PASS (`tests/unit/schema.test.ts` still passes).
- [ ] **Step 5:** Switch `src/routes/(app)/search/+page.server.ts` `load` to `cachedSearch(getDb(), q)` (same error handling). Run `npx playwright test tests/e2e/reading.spec.ts`. Expected: PASS.
- [ ] **Step 6:** Commit: `perf: cache Open Library search results for a day`.

### Task 3: Add a book to a chosen shelf without leaving search

**Files:**
- Modify: `src/lib/server/shelves.ts`
- Modify: `src/routes/(app)/search/+page.server.ts`, `src/routes/(app)/search/+page.svelte`
- Test: `tests/unit/shelves-reviews.test.ts`, `tests/unit/books.test.ts`, `tests/e2e/reading.spec.ts`

**Interfaces:**
- Consumes: `cachedSearch`, `normaliseQuery` (Task 2). `upsertOpenLibraryBook`, `addManualBook`, `setShelf`, `formStatus`, `withUserErrors` (existing).
- Produces:
  - `shelfStatusesForWorks(db: Db, userId: number, olWorkIds: string[]): Promise<Record<string, ShelfStatus>>` in `shelves.ts`. One query joining `shelf_entries` to `books` on `ol_work_id IN (...)`. Returns `{}` for an empty list without querying.
  - `addFromSearch(db: Db, userId: number, q: string, olWorkId: string, status: ShelfStatus): Promise<number>` in `search-cache.ts`. Finds the work in `cachedSearch(db, q)`. If it's missing (for example the cache was replaced by newer results), it tries once more with a fresh `searchOpenLibrary(q)`. If it's still missing, it throws `UserError("That book isn't in the results any more. Try searching again.")`. Otherwise it calls `upsertOpenLibraryBook` and `setShelf`, and returns the book id.
  - Search `load` returns `{ q, results, searchError, onShelf: Record<string, ShelfStatus> }`.
  - `add` action returns `{ added: { olWorkId: string; bookId: number; status: ShelfStatus } }`. No redirect.
  - `manual` action reads `status` too and still redirects to `/books/{id}`. The `?review=1` suffix is added when the status is `finished`.

- [ ] **Step 1: Write the failing unit tests:**
  - `shelfStatusesForWorks returns the member's status keyed by work id`: shelve OL1W as `reading` for user A and as `finished` for user B. Called for A with `['OL1W','OL2W']` → `{ OL1W: 'reading' }`.
  - `addFromSearch shelves a cached result`: prime the cache with a stub for `'le guin'`, then `addFromSearch(db, u, 'Le Guin', 'OL1W', 'to_read')` → returns an id and `getShelfStatus` is `'to_read'`.
  - `addFromSearch moves an already-shelved book`: call it twice with `to_read` then `reading` → status `'reading'` and one `books` row.
  - `addFromSearch refuses a work id not in the results`: `'OL999W'` → rejects with the "isn't in the results" message, and no `books` row is created.
- [ ] **Step 2:** Run `npx vitest run tests/unit`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement `shelfStatusesForWorks` and `addFromSearch`. Wire up `load` (`onShelf`) and the `add`/`manual` actions as in Interfaces.
- [ ] **Step 4: UI.** Each result's form gets a shelf choice and an Add button:
  - The shelf choice is a `<select name="status">` labelled "Shelf" with an accessible name of `Shelf for <title>`. It defaults to the result's `onShelf` value, or `to_read` if it has none.
  - The button's accessible name stays `Add <title>`.
  - If `onShelf[r.olWorkId]` is set, show `On your <label> shelf` under the author line.
  - After a successful add, the row shows `Added to <label>` with a link `View book` to `/books/{bookId}`. If the status is `finished`, also show a `Write a review` link to `/books/{bookId}?review=1`.
  - The manual form gets the same `<select name="status">` (label "Shelf").
- [ ] **Step 5: Update e2e** in `tests/e2e/reading.spec.ts`:
  - `search result opens its book page` becomes `adding from search shelves the book and stays on search`. Add "A Wizard of Earthsea" with Shelf "Reading" → the URL is still `/search?q=earthsea` and `Added to Reading` is visible. `View book` opens the book page with heading "A Wizard of Earthsea". Back on `/search?q=earthsea`, the row shows `On your Reading shelf`.
  - `search, add, shelve as to-read appears on shelves`: replace the add → book page → To-read steps with adding via the Shelf select set to "To-read". Keep the rest.
- [ ] **Step 6:** Run `npm run check && npm test && npx playwright test tests/e2e/reading.spec.ts`. Expected: PASS.
- [ ] **Step 7:** Commit: `feat: choose a shelf when adding from search and stay on the page`.

### Task 4: Search as you type

**Files:**
- Modify: `src/routes/(app)/search/+page.svelte`
- Test: `tests/e2e/reading.spec.ts`

**Interfaces:**
- Consumes: the search page from Task 3. `goto` from `$app/navigation`.
- Produces: nothing new for other tasks.

- [ ] **Step 1: Write the failing e2e tests:**
  - `search updates as you type`: `/search`, type `earthsea` into the searchbox without pressing anything → within 3s "A Wizard of Earthsea" is visible, the URL is `/search?q=earthsea`, and the searchbox still has focus.
  - `stale search responses never replace newer results`: hold the data request for `outage` with `page.route('**/search/__data.json?*q=outage*', ...)`; the stub answers it with the "unavailable" error. Type `outage`, wait 400ms, clear the box and type `earthsea`. Wait until "A Wizard of Earthsea" is visible, then release the held request and wait 500ms → "A Wizard of Earthsea" is still visible, there's no `alert` with the unavailable message, the input reads `earthsea`, and the URL ends `q=earthsea`.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/reading.spec.ts -g "as you type|stale"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Handle `oninput` on the searchbox with a 300ms debounce. Run the search only when the trimmed value is empty or at least 2 characters.
  - Call `goto('?q=' + encodeURIComponent(value), { replaceState: true, keepFocus: true, noScroll: true })`, and keep a request counter so a resolved navigation only applies if it is still the latest.
  - The input is bound to local state, not overwritten from `data.q` while focused.
  - The Search button and plain GET form stay for no-JS use.
- [ ] **Step 4:** Run `npx playwright test tests/e2e/reading.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: search as you type`.

### Task 5: Instant shelf tabs on Shelves and profiles

**Files:**
- Modify: `src/lib/server/shelves.ts`
- Create: `src/lib/components/ShelfTabs.svelte`
- Modify: `src/routes/(app)/shelves/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/(app)/u/[username]/+page.server.ts`, `+page.svelte`
- Test: `tests/unit/shelves-reviews.test.ts`, `tests/e2e/reading.spec.ts`, `tests/e2e/social.spec.ts`

**Interfaces:**
- Produces:
  - `listAllShelves(db: Db, userId: number): Promise<Record<ShelfStatus, (Book & { updatedAt: number })[]>>`. One query, ordered as `listShelf` orders today, then split by status. All three keys are always present.
  - `ShelfTabs.svelte` props: `{ counts: Record<ShelfStatus, number>; active: ShelfStatus | null; href: (s: ShelfStatus) => string; onselect: (s: ShelfStatus) => void; label: string }`.
    - It renders `<nav aria-label={label}>` with one `<a href>` per status, using `aria-current="page"` on the active one. This is today's markup, so existing selectors keep working.
    - A plain click (no modifier keys) calls `preventDefault()`, then `onselect(s)`, then `replaceState(href(s), {})` from `$app/navigation`.
    - The active underline is a single element that slides (`transform`) to the active tab over `var(--dur, 180ms)`.
  - `/shelves` load returns `{ tab, shelves, counts }`, where `counts` comes from the shelf lengths, so `shelfCounts` is no longer needed here.
  - `/u/[username]` load returns `{ ..., tab, shelves }` (`tab` may still be `null`, as today).

- [ ] **Step 1: Write the failing unit test** `listAllShelves splits by status in updatedAt order`: three books for one user across two shelves, plus one book for another user → each list holds the right ids in order, the other user's book is absent, and the empty shelf is `[]`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/shelves-reviews.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `listAllShelves`, `ShelfTabs`, and both pages.
  - Each page keeps `let tab = $state(data.tab)` and re-syncs it when `data.tab` changes.
  - The visible list crossfades on tab change (Svelte `fade`, `duration: 120`; under reduced motion, duration 0).
  - Shelf move/remove forms keep `use:enhance`. The default invalidation reloads `shelves`, so lists update in place.
- [ ] **Step 4: Add the e2e test** `switching shelf tabs needs no server round trip`: on `/shelves` with one book on each shelf, record `page.on('request')` for URLs containing `__data.json`. Click Reading then Finished → each tab's book is visible, the URL updates to `?tab=finished`, and no data request was made. Run the existing `reading.spec.ts` and `social.spec.ts`. Expected: PASS, including `?tab=nonsense` falling back to To-read and the profile `?tab=bogus` case.
- [ ] **Step 5:** Commit: `perf: load all shelves at once and switch tabs on the client`.

### Task 6: Hamburger sidebar; move Invite, Admin and Log out to Settings

**Files:**
- Create: `src/lib/components/Sidebar.svelte`
- Delete: `src/lib/components/Nav.svelte`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/routes/(app)/settings/+page.svelte`
- Test: `tests/e2e/auth.spec.ts`, `tests/e2e/social.spec.ts`, `tests/e2e/reading.spec.ts`, new `tests/e2e/nav.spec.ts`

**Interfaces:**
- Produces:
  - `Sidebar.svelte` props: `{ user: { username: string; displayName: string; isAdmin: boolean }; children?: Snippet }`. The `children` snippet renders at the bottom of the sidebar, which is where Task 9 puts the theme toggle.
  - Markup contract (the tests rely on it):
    - The top bar is a `<header>` holding a `<button aria-label="Menu" popovertarget="sidebar" aria-expanded aria-controls="sidebar">` and the "Reading List" brand link.
    - The sidebar is `<nav id="sidebar" popover aria-label="Main">`, containing a close button `aria-label="Close menu"` and links in this order: For You, Search, Shelves, People, Profile, then a separator, then Settings. The current page gets `aria-current="page"`, matched the same way `Nav.svelte` does today.
  - Settings gets a final `<section class="card">` with `<h2>More</h2>` holding an `Invite a friend` link to `/invite`, an `Admin` link to `/admin` (admins only), and the existing log-out form (`POST /logout`, button text `Log out`).

- [ ] **Step 1: Write the failing e2e tests** in `tests/e2e/nav.spec.ts`:
  - `sidebar opens, traps focus, closes on Escape`: logged in at `/` → `navigation "Main"` is hidden. Click `Menu` → it is visible and focus is inside it. Press Tab 10 times → focus stays inside the sidebar. Escape → hidden, and focus is on `Menu`.
  - `sidebar link navigates and closes the sidebar`: open it, click Shelves → URL `/shelves`, sidebar hidden.
  - `sidebar works without JavaScript`: `test.use({ javaScriptEnabled: false })`, click `Menu` → the Shelves link is visible and navigates. This relies on native `popover`.
  - `log out, invite and admin live in Settings`: a member's sidebar has no Invite/Admin/Log out. Settings shows Invite and Log out, and Admin only for the seeded admin.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/nav.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `Sidebar.svelte`.**
  - Use native `popover` (auto), so Escape and clicking outside close it with no JS.
  - With JS: on `toggle`, sync `aria-expanded`. When it opens, focus the first link; while it's open, wrap Tab/Shift+Tab inside it. When it closes, return focus to the Menu button. Close it on `afterNavigate`.
  - Slide in from the left (`transform: translateX(-100%)` → `0`, with `@starting-style` and `transition-behavior: allow-discrete`), with a dimmed `::backdrop`.
  - Width `min(20rem, 85vw)`, full height.
  - Swap it in for `Nav` in `+layout.svelte`. Add the "More" section to Settings.
- [ ] **Step 4: Update the existing tests** that click top-bar links or Log out:
  - `auth.spec.ts:24-25,56-57`: open `Menu` first. The Admin link and Log out are now on `/settings`.
  - `reading.spec.ts:186`: open `Menu` before clicking Shelves.
  - `social.spec.ts:90`: open `Menu` before using `navigation "Main"`.

  Run all e2e specs. Expected: PASS, including `reading pages fit a 360px screen without horizontal scroll`.
- [ ] **Step 5:** Commit: `feat: slide-out sidebar navigation; move invite, admin and log out to settings`.

### Task 7: Motion tokens, press effect and page transitions

**Files:**
- Modify: `src/app.css` (new `/* Motion */` section at the end, plus the button rules)
- Modify: `src/routes/+layout.svelte`
- Test: `tests/e2e/nav.spec.ts` (append; create the file if Task 6 hasn't landed yet)

**Interfaces:**
- Produces the CSS custom properties `--ease`, `--dur-fast`, `--dur` on `:root`, with the values given in Global Constraints.

- [ ] **Step 1: Write the failing e2e test** `buttons visibly react to a press`: on `/settings`, hover `Save name`, then `page.mouse.down()` → `getComputedStyle(button).transform` is not `none`. Then `mouse.up()`. Also `reduced motion turns transitions off`: with `page.emulateMedia({ reducedMotion: 'reduce' })`, the computed `transition-duration` of `button` is `0s`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `button, .button`: transition `transform var(--dur-fast) var(--ease), filter var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease)`, and `:active { transform: scale(0.97); filter: brightness(0.94); }`. `.link-button:active` gets `opacity: 0.7`.
  - Tab and link hover colours transition over `--dur-fast`.
  - Add a `@media (prefers-reduced-motion: reduce)` block that sets `*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }`.
  - In `+layout.svelte`, use `onNavigate`: if `document.startViewTransition` exists and the user hasn't asked for reduced motion, wrap the navigation in it (`return new Promise(resolve => document.startViewTransition(async () => { resolve(); await navigation.complete; }))`). Style `::view-transition-old(root)` / `-new(root)` with a `--dur` crossfade.
- [ ] **Step 4:** Run all e2e specs. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: press feedback, motion tokens and page crossfades`.

### Task 8: Light/dark/system modes and colour schemes

**Files:**
- Create: `src/lib/theme.ts`
- Modify: `src/app.css` (colour token blocks only)
- Modify: `src/app.html`, `src/hooks.server.ts`
- Create: `src/routes/(app)/settings/theme/+server.ts`
- Modify: `src/routes/(app)/settings/+page.svelte`, `+page.server.ts` (load `theme`)
- Test: `tests/unit/theme.test.ts`, new `tests/e2e/theme.spec.ts`

**Interfaces:**
- Produces, in `src/lib/theme.ts` (shared by client and server):
  - `THEME_MODES = ['system', 'light', 'dark'] as const`, `type ThemeMode`.
  - `SCHEMES = ['paper', 'sage', 'slate', 'plum'] as const`, `type Scheme`, plus `SCHEME_LABELS: Record<Scheme, string>`.
  - `THEME_COOKIE = 'theme'`, `SCHEME_COOKIE = 'scheme'`, `THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365`.
  - `parseThemePrefs(theme: string | undefined, scheme: string | undefined): { mode: ThemeMode; scheme: Scheme }`. Unknown or missing values become `system` / `paper`.
  - `nextMode(mode: ThemeMode): ThemeMode`: system → light → dark → system.
  - `applyThemePrefs(prefs)` (browser only): sets `document.documentElement.dataset.theme` / `.scheme` and writes both cookies (`path=/; max-age=…; samesite=lax`).
- `src/app.html`: `<html lang="en" data-theme="%theme%" data-scheme="%scheme%">`. `hooks.server.ts` passes `resolve(e, { transformPageChunk: ({ html }) => html.replace('%theme%', prefs.mode).replace('%scheme%', prefs.scheme) })` into `handleAuth`, where `prefs` comes from `parseThemePrefs` on the cookies. Pages also get `locals.theme` (add to `App.Locals` in `src/app.d.ts`), and the root `+layout.server.ts` returns it as `theme`.
- `POST /settings/theme` takes form fields `mode` and/or `scheme`, validates them with `parseThemePrefs` (keeping the current value for any field that's missing), sets the cookies (not `httpOnly`), and redirects 303 to the same-origin `Referer` path or `/settings`. JS callers send `accept: application/json` and get `{ mode, scheme }` back instead.
- CSS: tokens move to `:root[data-scheme='paper']` (light values) and dark values that apply under `[data-theme='dark']` or under `[data-theme='system']` with `prefers-color-scheme: dark`. Repeat for `sage`, `slate`, `plum`. `color-scheme` follows the effective mode. The current Paper values stay exactly as they are.

- [ ] **Step 1: Write the failing unit tests** in `tests/unit/theme.test.ts`:
  - `parseThemePrefs` accepts valid values: `('dark','plum')` → `{ mode: 'dark', scheme: 'plum' }`.
  - `parseThemePrefs` rejects unknown values: `('<script>', 'x" onload="y')` → `{ mode: 'system', scheme: 'paper' }`. `(undefined, undefined)` gives the same.
  - `nextMode` cycles `system → light → dark → system`.
  - A contrast check: for every scheme × mode, parse the token values from `src/app.css` and assert that `--color-ink` on `--color-bg`, `--color-ink` on `--color-surface`, and `--color-accent-ink` on `--color-accent` each have a contrast ratio of at least 4.5. Write a small `contrast(hexA, hexB)` helper in the test file.
- [ ] **Step 2:** Run `npx vitest run tests/unit/theme.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `theme.ts`, the hook and `app.html` changes, the CSS token blocks, and the `/settings/theme` endpoint. Pick the Sage, Slate and Plum colours so the contrast test passes.
- [ ] **Step 4: Settings picker.** Add a section `<h2>Appearance</h2>` holding a form that POSTs to `/settings/theme`:
  - a `fieldset` "Mode" with three radio buttons (System, Light, Dark);
  - a `fieldset` "Colour scheme" with four radio buttons, each with a swatch of its accent and background colours;
  - a `Save appearance` button for no-JS use.

  With JS, changing a radio calls `applyThemePrefs` straight away and POSTs in the background.
- [ ] **Step 5: Write and run the e2e test** `tests/e2e/theme.spec.ts`:
  - `theme choice applies immediately and survives reload`: on Settings pick Dark + Sage → `html` has `data-theme="dark"` and `data-scheme="sage"` without navigating. After a reload they're still set.
  - `theme works without JavaScript`: with JS disabled, pick Light + Plum and press `Save appearance` → after the redirect, `html[data-theme="light"][data-scheme="plum"]`.

  Run `npm run check && npm test && npx playwright test`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat: light/dark/system modes and colour schemes`.

### Task 9: Theme toggle in the sidebar

**Files:**
- Create: `src/lib/components/ThemeToggle.svelte`
- Modify: `src/routes/+layout.svelte` (pass it as `Sidebar`'s `children`)
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: `Sidebar` `children` (Task 6). `nextMode`, `applyThemePrefs`, `POST /settings/theme`, and `data.theme` from the root layout (Task 8).

- [ ] **Step 1: Write the failing e2e test** `sidebar toggle cycles mode`: open `Menu`, then click the button named `Theme: System` → `html[data-theme="light"]` and the button reads `Theme: Light`. Click again → dark.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement `ThemeToggle`.** It is a `<form method="POST" action="/settings/theme">` with a hidden `mode` input holding `nextMode(current)` and a submit button `Theme: <Mode>` with a sun/moon/auto glyph. With JS, it calls `applyThemePrefs` and POSTs in the background without navigating.
- [ ] **Step 4:** Run `npx playwright test tests/e2e/theme.spec.ts tests/e2e/nav.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: theme toggle in the sidebar`.

### Task 10: Busy state on every submitting form

**Files:**
- Create: `src/lib/pending.ts`
- Modify: every `use:enhance` form in `src/routes/**/+page.svelte` and `src/lib/components/**` (find them with `grep -rn "use:enhance" src`)
- Modify: `src/app.css` (`[aria-busy='true']` style in the Motion section)
- Test: `tests/e2e/nav.spec.ts`

**Interfaces:**
- Produces: `pending: Action<HTMLFormElement, SubmitFunction | undefined>` in `src/lib/pending.ts`. It wraps SvelteKit's `enhance` (forwarding the optional submit function). On submit it sets `aria-busy="true"` and `disabled` on the submitter (the `submitter` in the submit event), plus a `data-pending` attribute on the form. When the result is applied, or on error, it clears all three. A second submit while pending is prevented.
- CSS: `button[aria-busy='true']` is dimmed (`opacity: 0.7`), with an 0.9em spinner `::after` that rotates via `animation` (instant under reduced motion) and `cursor: progress`.

- [ ] **Step 1: Write the failing e2e test** `submitting shows a busy button until done`: delay `POST /settings?/name` by 500ms with `page.route` and `route.continue()` after a timeout. Click `Save name` → it has `aria-busy="true"` and is disabled. After the response, `Name saved.` is visible and the button has no `aria-busy`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `pending.ts`. Replace `use:enhance` with `use:pending` everywhere (`use:pending={fn}` where a submit function was passed), and add the CSS.
- [ ] **Step 4:** Run `npm run check && npx playwright test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: busy state on submitting buttons`.

### Task 11: Verify on a preview deploy

**Files:** none (verification only). This task's outward-facing steps need the user's go-ahead.

- [ ] **Step 1:** Run `npm run check && npm test && npx playwright test && npm run build`. Expected: all pass.
- [ ] **Step 2: Ask the user before touching production data.** Then apply migration `0001` to Turso with `npm run db:migrate`, using the production `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` from `.env`. It only adds a table.
- [ ] **Step 3:** Deploy a preview with `vercel deploy` (project `reading-9c55`). Confirm the function region in `vercel inspect <url>` is `pdx1`.
- [ ] **Step 4: Measure on the preview.** Log in, then time with `curl -w '%{time_total}'` and a session cookie:
  - `/shelves` (data request `__data.json`);
  - a repeated `/search?q=dune` (cached);
  - an add.

  Expected: each well under 300ms, against about 1s before. Report the numbers to the user.
- [ ] **Step 5:** Hand back to the user to look at the preview. Promote to production only when they say so.
