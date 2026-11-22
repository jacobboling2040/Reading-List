import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { olSearchCache } from './db/schema';
import { searchOpenLibrary, upsertOpenLibraryBook, type SearchResult } from './books';
import { UserError } from './errors';
import { setShelf, type ShelfStatus } from './shelves';

export const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function normaliseQuery(q: string): string {
	return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function cachedSearch(
	db: Db,
	q: string,
	opts: { fetchFn?: typeof fetch; now?: number } = {}
): Promise<SearchResult[]> {
	const query = normaliseQuery(q);
	if (!query) return [];
	const now = opts.now ?? Date.now();
	const [row] = await db.select().from(olSearchCache).where(eq(olSearchCache.query, query));
	if (row && now - row.fetchedAt < SEARCH_CACHE_TTL_MS) {
		return JSON.parse(row.results) as SearchResult[];
	}
	// A failed fetch throws here, so failures are never written to the cache.
	const results = await searchOpenLibrary(query, opts.fetchFn);
	const json = JSON.stringify(results);
	await db
		.insert(olSearchCache)
		.values({ query, results: json, fetchedAt: now })
		.onConflictDoUpdate({ target: olSearchCache.query, set: { results: json, fetchedAt: now } });
	return results;
}

// The client sends only the query and the picked work id; the book's details come from the
// search results so a member can't store made-up details under a real work id.
export async function addFromSearch(
	db: Db,
	userId: number,
	q: string,
	olWorkId: string,
	status: ShelfStatus,
	opts: { fetchFn?: typeof fetch; now?: number } = {}
): Promise<number> {
	const find = (results: SearchResult[]) => results.find((r) => r.olWorkId === olWorkId);
	// The cache may have been replaced by newer results since the page loaded, so retry fresh once.
	const match =
		find(await cachedSearch(db, q, opts)) ?? find(await searchOpenLibrary(q, opts.fetchFn));
	if (!match) throw new UserError("That book isn't in the results any more. Try searching again.");
	const bookId = await upsertOpenLibraryBook(db, match, userId);
	await setShelf(db, userId, bookId, status);
	return bookId;
}
