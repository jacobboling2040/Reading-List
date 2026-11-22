import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { books, shelfEntries } from './db/schema';
import { getBook, rowToBook, type Book } from './books';
import { UserError } from './errors';

export type ShelfStatus = 'to_read' | 'reading' | 'finished';

export async function setShelf(
	db: Db,
	userId: number,
	bookId: number,
	status: ShelfStatus,
	now = Date.now()
): Promise<void> {
	if (!(await getBook(db, bookId))) throw new UserError('That book no longer exists.');
	await db
		.insert(shelfEntries)
		.values({ userId, bookId, status, updatedAt: now })
		.onConflictDoUpdate({
			target: [shelfEntries.userId, shelfEntries.bookId],
			set: { status, updatedAt: now }
		});
}

export async function removeFromShelf(db: Db, userId: number, bookId: number): Promise<void> {
	await db
		.delete(shelfEntries)
		.where(and(eq(shelfEntries.userId, userId), eq(shelfEntries.bookId, bookId)));
}

export async function getShelfStatus(
	db: Db,
	userId: number,
	bookId: number
): Promise<ShelfStatus | null> {
	const row = await db
		.select({ status: shelfEntries.status })
		.from(shelfEntries)
		.where(and(eq(shelfEntries.userId, userId), eq(shelfEntries.bookId, bookId)))
		.get();
	return row?.status ?? null;
}

export async function listShelf(
	db: Db,
	userId: number,
	status: ShelfStatus
): Promise<(Book & { updatedAt: number })[]> {
	const rows = await db
		.select({ book: books, updatedAt: shelfEntries.updatedAt })
		.from(shelfEntries)
		.innerJoin(books, eq(books.id, shelfEntries.bookId))
		.where(and(eq(shelfEntries.userId, userId), eq(shelfEntries.status, status)))
		.orderBy(desc(shelfEntries.updatedAt), desc(books.id));
	return rows.map((r) => ({ ...rowToBook(r.book), updatedAt: r.updatedAt }));
}

export async function listAllShelves(
	db: Db,
	userId: number
): Promise<Record<ShelfStatus, (Book & { updatedAt: number })[]>> {
	const rows = await db
		.select({ book: books, updatedAt: shelfEntries.updatedAt, status: shelfEntries.status })
		.from(shelfEntries)
		.innerJoin(books, eq(books.id, shelfEntries.bookId))
		.where(eq(shelfEntries.userId, userId))
		.orderBy(desc(shelfEntries.updatedAt), desc(books.id));
	const shelves: Record<ShelfStatus, (Book & { updatedAt: number })[]> = {
		to_read: [],
		reading: [],
		finished: []
	};
	for (const r of rows) shelves[r.status].push({ ...rowToBook(r.book), updatedAt: r.updatedAt });
	return shelves;
}

export async function shelfCounts(db: Db, userId: number): Promise<Record<ShelfStatus, number>> {
	const rows = await db
		.select({ status: shelfEntries.status, n: sql<number>`count(*)` })
		.from(shelfEntries)
		.where(eq(shelfEntries.userId, userId))
		.groupBy(shelfEntries.status);
	const counts: Record<ShelfStatus, number> = { to_read: 0, reading: 0, finished: 0 };
	for (const r of rows) counts[r.status] = Number(r.n);
	return counts;
}
