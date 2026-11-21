import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import type { Db } from '../../src/lib/server/db/client';
import { users } from '../../src/lib/server/db/schema';
import {
	searchOpenLibrary,
	upsertOpenLibraryBook,
	addManualBook,
	getBook,
	coverUrl,
	type SearchResult
} from '../../src/lib/server/books';

const UNAVAILABLE = 'Book search is unavailable right now. You can add it manually.';

function stub(body: unknown, status = 200): typeof fetch {
	return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

let db: Db;
let userId: number;

beforeEach(async () => {
	db = await createTestDb();
	const [u] = await db
		.insert(users)
		.values({
			username: 'a',
			displayName: 'A',
			passwordHash: 'x',
			createdAt: 1
		})
		.returning();
	userId = u.id;
});

describe('searchOpenLibrary', () => {
	it('maps fields and strips /works/', async () => {
		const r = await searchOpenLibrary(
			'dune',
			stub({
				docs: [
					{
						key: '/works/OL123W',
						title: 'Dune',
						author_name: ['Frank Herbert'],
						cover_i: 42,
						first_publish_year: 1965
					}
				]
			})
		);
		expect(r).toEqual([
			{
				olWorkId: 'OL123W',
				title: 'Dune',
				authors: ['Frank Herbert'],
				coverId: 42,
				year: 1965
			}
		]);
	});

	it('missing author_name gives [] and missing cover_i gives null', async () => {
		const r = await searchOpenLibrary('x', stub({ docs: [{ key: '/works/OL1W', title: 'T' }] }));
		expect(r[0].authors).toEqual([]);
		expect(r[0].coverId).toBeNull();
		expect(r[0].year).toBeNull();
	});

	it('empty query returns [] without fetching', async () => {
		const f = vi.fn();
		expect(await searchOpenLibrary('   ', f as unknown as typeof fetch)).toEqual([]);
		expect(f).not.toHaveBeenCalled();
	});

	it('encodes the query and uses the configured base url', async () => {
		const f = vi.fn(async () => new Response(JSON.stringify({ docs: [] })));
		await searchOpenLibrary(' a&b ', f as unknown as typeof fetch);
		const url = String((f.mock.calls[0] as unknown[])[0]);
		expect(url).toContain('https://openlibrary.org/search.json?');
		expect(url).toContain('q=a%26b');
		expect(url).toContain('limit=20');
	});

	it('HTTP 500 throws the unavailable message', async () => {
		await expect(searchOpenLibrary('x', stub({}, 500))).rejects.toThrow(UNAVAILABLE);
	});

	it('timeout throws the unavailable message', async () => {
		const hang = ((_u: unknown, init?: RequestInit) =>
			new Promise((_res, rej) => {
				init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
			})) as unknown as typeof fetch;
		await expect(searchOpenLibrary('x', hang, 20)).rejects.toThrow(UNAVAILABLE);
	});
});

describe('books', () => {
	const r: SearchResult = {
		olWorkId: 'OL9W',
		title: 'Dune',
		authors: ['Frank Herbert'],
		coverId: 1,
		year: 1965
	};

	it('upsert twice returns same id', async () => {
		const a = await upsertOpenLibraryBook(db, r, userId);
		const b = await upsertOpenLibraryBook(db, r, userId);
		expect(a).toBe(b);
		expect(await getBook(db, a)).toEqual({
			id: a,
			olWorkId: 'OL9W',
			title: 'Dune',
			authors: ['Frank Herbert'],
			coverId: 1,
			year: 1965
		});
	});

	it('manual book with empty title rejected', async () => {
		await expect(addManualBook(db, { title: '  ', author: 'A' }, userId)).rejects.toThrow();
		await expect(addManualBook(db, { title: 'T', author: '' }, userId)).rejects.toThrow();
		await expect(
			addManualBook(db, { title: 'x'.repeat(201), author: 'A' }, userId)
		).rejects.toThrow();
	});

	it('manual book is stored', async () => {
		const id = await addManualBook(db, { title: ' T ', author: ' A ' }, userId);
		const b = await getBook(db, id);
		expect(b).toMatchObject({
			title: 'T',
			authors: ['A'],
			olWorkId: null,
			coverId: null
		});
		expect(await getBook(db, 9999)).toBeNull();
	});

	it('coverUrl', () => {
		expect(coverUrl(5, 'M')).toBe('https://covers.openlibrary.org/b/id/5-M.jpg');
		expect(coverUrl(null, 'S')).toBeNull();
	});
});
