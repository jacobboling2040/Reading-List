import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from './db/client';
import { books, reviews, shelfEntries, users } from './db/schema';
import { getBook, rowToBook, type Book } from './books';
import { UserError } from './errors';

export type ReviewView = {
	userId: number;
	username: string;
	displayName: string;
	rating: number;
	body: string | null;
	updatedAt: number;
};

const MAX_BODY = 5000;

export async function saveReview(
	db: Db,
	userId: number,
	bookId: number,
	input: { rating: number; body?: string },
	now = Date.now()
): Promise<void> {
	const { rating } = input;
	if (!Number.isInteger(rating) || rating < 1 || rating > 5)
		throw new UserError('Pick a rating from 1 to 5 stars.');
	const body = Array.from((input.body ?? '').trim()).slice(0, MAX_BODY).join('') || null;
	if (!(await getBook(db, bookId))) throw new UserError('That book no longer exists.');
	await db.transaction(async (tx) => {
		await tx
			.insert(reviews)
			.values({ userId, bookId, rating, body, createdAt: now, updatedAt: now })
			.onConflictDoUpdate({
				target: [reviews.userId, reviews.bookId],
				set: { rating, body, updatedAt: now }
			});
		await tx
			.insert(shelfEntries)
			.values({ userId, bookId, status: 'finished', updatedAt: now })
			.onConflictDoNothing();
	});
}

export async function deleteReview(db: Db, userId: number, bookId: number): Promise<void> {
	await db.delete(reviews).where(and(eq(reviews.userId, userId), eq(reviews.bookId, bookId)));
}

export async function listBookReviews(db: Db, bookId: number): Promise<ReviewView[]> {
	return db
		.select({
			userId: users.id,
			username: users.username,
			displayName: users.displayName,
			rating: reviews.rating,
			body: reviews.body,
			updatedAt: reviews.updatedAt
		})
		.from(reviews)
		.innerJoin(users, eq(users.id, reviews.userId))
		.where(and(eq(reviews.bookId, bookId), isNull(users.deactivatedAt)))
		.orderBy(desc(reviews.updatedAt), desc(reviews.id));
}

export async function listToReadMembers(
	db: Db,
	bookId: number
): Promise<{ username: string; displayName: string }[]> {
	return db
		.select({ username: users.username, displayName: users.displayName })
		.from(shelfEntries)
		.innerJoin(users, eq(users.id, shelfEntries.userId))
		.where(
			and(
				eq(shelfEntries.bookId, bookId),
				eq(shelfEntries.status, 'to_read'),
				isNull(users.deactivatedAt)
			)
		)
		.orderBy(desc(shelfEntries.updatedAt), desc(users.id));
}

export async function listUserReviews(
	db: Db,
	userId: number,
	limit = 10
): Promise<{ book: Book; rating: number; body: string | null; updatedAt: number }[]> {
	const rows = await db
		.select({
			book: books,
			rating: reviews.rating,
			body: reviews.body,
			updatedAt: reviews.updatedAt
		})
		.from(reviews)
		.innerJoin(books, eq(books.id, reviews.bookId))
		.where(eq(reviews.userId, userId))
		.orderBy(desc(reviews.updatedAt), desc(reviews.id))
		.limit(limit);
	return rows.map((r) => ({ ...r, book: rowToBook(r.book) }));
}
