import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import type { Db } from '../../src/lib/server/db/client';
import { books, users } from '../../src/lib/server/db/schema';
import { getShelfStatus } from '../../src/lib/server/shelves';
import {
	addFromSearch,
	cachedSearch,
	normaliseQuery,
	SEARCH_CACHE_TTL_MS
} from '../../src/lib/server/search-cache';

const UNAVAILABLE = 'Book search is unavailable right now. You can add it manually.';
const DUNE = {
	olWorkId: 'OL123W',
	title: 'Dune',
	authors: ['Frank Herbert'],
	coverId: 99,
	year: 1965
};

function countingStub(status = 200) {
	return vi.fn(
		async () =>
			new Response(
				JSON.stringify({
					docs: [
						{
							key: '/works/OL123W',
							title: 'Dune',
							author_name: ['Frank Herbert'],
							cover_i: 99,
							first_publish_year: 1965
						}
					]
				}),
				{ status }
			)
	);
}
const asFetch = (f: ReturnType<typeof countingStub>) => f as unknown as typeof fetch;

let db: Db;
beforeEach(async () => {
	db = await createTestDb();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('normaliseQuery', () => {
	it('trims, lowercases and collapses whitespace', () => {
		expect(normaliseQuery('  Le   GUIN ')).toBe('le guin');
	});
});

describe('cachedSearch', () => {
	it('serves a second identical search from cache', async () => {
		const f = countingStub();
		const a = await cachedSearch(db, 'Dune', { fetchFn: asFetch(f) });
		const b = await cachedSearch(db, ' dune ', { fetchFn: asFetch(f) });
		expect(f).toHaveBeenCalledTimes(1);
		expect(a).toEqual([DUNE]);
		expect(b).toEqual([DUNE]);
	});

	it('refetches after the TTL', async () => {
		const f = countingStub();
		await cachedSearch(db, 'Dune', { fetchFn: asFetch(f), now: 0 });
		await cachedSearch(db, 'Dune', { fetchFn: asFetch(f), now: SEARCH_CACHE_TTL_MS + 1 });
		expect(f).toHaveBeenCalledTimes(2);
	});

	it('does not cache failures', async () => {
		const bad = countingStub(500);
		await expect(cachedSearch(db, 'Dune', { fetchFn: asFetch(bad) })).rejects.toThrow(UNAVAILABLE);
		const good = countingStub();
		expect(await cachedSearch(db, 'Dune', { fetchFn: asFetch(good) })).toEqual([DUNE]);
		expect(good).toHaveBeenCalledTimes(1);
	});

	it('empty query does not fetch', async () => {
		const f = countingStub();
		expect(await cachedSearch(db, '   ', { fetchFn: asFetch(f) })).toEqual([]);
		expect(f).not.toHaveBeenCalled();
	});
});

describe('addFromSearch', () => {
	async function user() {
		const [u] = await db
			.insert(users)
			.values({ username: 'adder', displayName: 'Adder', passwordHash: 'x', createdAt: 0 })
			.returning({ id: users.id });
		return u.id;
	}

	it('shelves a cached result', async () => {
		const u = await user();
		await cachedSearch(db, 'le guin', { fetchFn: asFetch(countingStub()) });
		const id = await addFromSearch(db, u, 'Le Guin', 'OL123W', 'to_read');
		expect(await getShelfStatus(db, u, id)).toBe('to_read');
	});

	it('moves an already-shelved book', async () => {
		const u = await user();
		await cachedSearch(db, 'le guin', { fetchFn: asFetch(countingStub()) });
		const id = await addFromSearch(db, u, 'le guin', 'OL123W', 'to_read');
		expect(await addFromSearch(db, u, 'le guin', 'OL123W', 'reading')).toBe(id);
		expect(await getShelfStatus(db, u, id)).toBe('reading');
		expect(await db.select().from(books)).toHaveLength(1);
	});

	it('retries with fresh results when the cached ones lack the work', async () => {
		const u = await user();
		await cachedSearch(db, 'le guin', { fetchFn: asFetch(countingStub()) });
		const fresh = vi.fn(
			async () =>
				new Response(
					JSON.stringify({ docs: [{ key: '/works/OL9W', title: 'New', author_name: ['A'] }] })
				)
		);
		const id = await addFromSearch(db, u, 'le guin', 'OL9W', 'finished', {
			fetchFn: fresh as unknown as typeof fetch
		});
		expect(await getShelfStatus(db, u, id)).toBe('finished');
	});

	it('refuses a work id not in the results', async () => {
		const u = await user();
		const f = asFetch(countingStub());
		await cachedSearch(db, 'le guin', { fetchFn: f });
		await expect(
			addFromSearch(db, u, 'le guin', 'OL999W', 'to_read', { fetchFn: f })
		).rejects.toThrow("isn't in the results");
		expect(await db.select().from(books)).toHaveLength(0);
	});
});
