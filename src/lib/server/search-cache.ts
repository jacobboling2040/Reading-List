import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { olSearchCache } from './db/schema';
import { searchOpenLibrary, type SearchResult } from './books';

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
