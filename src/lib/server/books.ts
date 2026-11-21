import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { books } from './db/schema';
import { UserError } from './errors';

export type SearchResult = {
	olWorkId: string;
	title: string;
	authors: string[];
	coverId: number | null;
	year: number | null;
};

export type Book = {
	id: number;
	olWorkId: string | null;
	title: string;
	authors: string[];
	coverId: number | null;
	year: number | null;
};

const UNAVAILABLE = 'Book search is unavailable right now. You can add it manually.';

type OlDoc = {
	key?: string;
	title?: string;
	author_name?: string[];
	cover_i?: number;
	first_publish_year?: number;
};

export async function searchOpenLibrary(
	q: string,
	fetchFn: typeof fetch = fetch,
	timeoutMs = 5000
): Promise<SearchResult[]> {
	const query = q.trim();
	if (!query) return [];
	const base = process.env.OPENLIBRARY_BASE_URL ?? 'https://openlibrary.org';
	const params = new URLSearchParams({
		q: query,
		fields: 'key,title,author_name,cover_i,first_publish_year',
		limit: '20'
	});
	try {
		const res = await fetchFn(`${base}/search.json?${params}`, {
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as { docs?: OlDoc[] };
		const results: SearchResult[] = [];
		for (const d of data.docs ?? []) {
			if (!d.key || !d.title) continue;
			results.push({
				olWorkId: d.key.replace('/works/', ''),
				title: d.title,
				authors: d.author_name ?? [],
				coverId: d.cover_i ?? null,
				year: d.first_publish_year ?? null
			});
		}
		return results;
	} catch {
		throw new UserError(UNAVAILABLE);
	}
}

export async function upsertOpenLibraryBook(
	db: Db,
	r: SearchResult,
	userId: number
): Promise<number> {
	const find = () =>
		db.select({ id: books.id }).from(books).where(eq(books.olWorkId, r.olWorkId)).get();
	const existing = await find();
	if (existing) return existing.id;
	await db
		.insert(books)
		.values({
			olWorkId: r.olWorkId,
			title: r.title,
			authors: JSON.stringify(r.authors),
			coverId: r.coverId,
			year: r.year,
			createdBy: userId
		})
		.onConflictDoNothing();
	const row = await find();
	return row!.id;
}

export async function addManualBook(
	db: Db,
	input: { title: string; author: string },
	userId: number
): Promise<number> {
	const title = input.title.trim();
	const author = input.author.trim();
	if (title.length < 1 || title.length > 200)
		throw new UserError('Title must be 1 to 200 characters.');
	if (author.length < 1 || author.length > 100)
		throw new UserError('Author must be 1 to 100 characters.');
	const [row] = await db
		.insert(books)
		.values({ title, authors: JSON.stringify([author]), createdBy: userId })
		.returning({ id: books.id });
	return row.id;
}

export async function getBook(db: Db, id: number): Promise<Book | null> {
	const row = await db.select().from(books).where(eq(books.id, id)).get();
	if (!row) return null;
	return {
		id: row.id,
		olWorkId: row.olWorkId,
		title: row.title,
		authors: JSON.parse(row.authors) as string[],
		coverId: row.coverId,
		year: row.year
	};
}

export function coverUrl(coverId: number | null, size: 'S' | 'M' | 'L'): string | null {
	return coverId == null ? null : `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}
