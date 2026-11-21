import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../src/lib/server/db/test-db';
import type { Db } from '../../src/lib/server/db/client';
import { users, shelfEntries, reviews } from '../../src/lib/server/db/schema';
import { addManualBook } from '../../src/lib/server/books';
import {
	setShelf,
	removeFromShelf,
	getShelfStatus,
	listShelf,
	shelfCounts
} from '../../src/lib/server/shelves';
import {
	saveReview,
	deleteReview,
	listBookReviews,
	listToReadMembers,
	listUserReviews
} from '../../src/lib/server/reviews';

let db: Db;
let u1: number;
let u2: number;
let b1: number;
let b2: number;

async function mkUser(name: string) {
	const [u] = await db
		.insert(users)
		.values({ username: name, displayName: name.toUpperCase(), passwordHash: 'x', createdAt: 1 })
		.returning({ id: users.id });
	return u.id;
}

beforeEach(async () => {
	db = await createTestDb();
	u1 = await mkUser('a');
	u2 = await mkUser('b');
	b1 = await addManualBook(db, { title: 'One', author: 'X' }, u1);
	b2 = await addManualBook(db, { title: 'Two', author: 'Y' }, u1);
});

describe('shelves', () => {
	it('setShelf moves between statuses (one row)', async () => {
		await setShelf(db, u1, b1, 'to_read', 1);
		await setShelf(db, u1, b1, 'reading', 2);
		expect(await getShelfStatus(db, u1, b1)).toBe('reading');
		expect(await db.select().from(shelfEntries)).toHaveLength(1);
		expect(await shelfCounts(db, u1)).toEqual({ to_read: 0, reading: 1, finished: 0 });
	});

	it('listShelf newest first; remove works', async () => {
		await setShelf(db, u1, b1, 'to_read', 1);
		await setShelf(db, u1, b2, 'to_read', 2);
		const l = await listShelf(db, u1, 'to_read');
		expect(l.map((b) => b.title)).toEqual(['Two', 'One']);
		expect(l[0].authors).toEqual(['Y']);
		await removeFromShelf(db, u1, b2);
		expect(await getShelfStatus(db, u1, b2)).toBeNull();
	});
});

describe('reviews', () => {
	it('saveReview on unshelved book shelves it as finished', async () => {
		await saveReview(db, u1, b1, { rating: 4, body: '  nice  ' });
		expect(await getShelfStatus(db, u1, b1)).toBe('finished');
		const r = await listBookReviews(db, b1);
		expect(r[0]).toMatchObject({ username: 'a', rating: 4, body: 'nice' });
	});

	it('saveReview keeps an existing shelf status', async () => {
		await setShelf(db, u1, b1, 'reading');
		await saveReview(db, u1, b1, { rating: 4 });
		expect(await getShelfStatus(db, u1, b1)).toBe('reading');
	});

	it('saveReview twice updates, one row', async () => {
		await saveReview(db, u1, b1, { rating: 4 });
		await saveReview(db, u1, b1, { rating: 2, body: 'meh' });
		const rows = await db.select().from(reviews);
		expect(rows).toHaveLength(1);
		expect(rows[0].rating).toBe(2);
	});

	it('caps body at 5000 chars', async () => {
		await saveReview(db, u1, b1, { rating: 3, body: 'x'.repeat(6000) });
		expect((await listBookReviews(db, b1))[0].body).toHaveLength(5000);
	});

	it.each([0, 6, 3.5])('rating %s rejected with message', async (rating) => {
		await expect(saveReview(db, u1, b1, { rating })).rejects.toThrow(
			'Pick a rating from 1 to 5 stars.'
		);
	});

	it("deactivated user's review hidden from listBookReviews and their to-read hidden", async () => {
		await saveReview(db, u1, b1, { rating: 5 });
		await saveReview(db, u2, b1, { rating: 3 });
		await setShelf(db, u1, b2, 'to_read');
		await setShelf(db, u2, b2, 'to_read');
		await db.update(users).set({ deactivatedAt: 5 }).where(eq(users.id, u1));
		expect((await listBookReviews(db, b1)).map((r) => r.username)).toEqual(['b']);
		expect(await listToReadMembers(db, b2)).toEqual([{ username: 'b', displayName: 'B' }]);
	});

	it('moving finished → to_read keeps review', async () => {
		await saveReview(db, u1, b1, { rating: 5 });
		await setShelf(db, u1, b1, 'to_read');
		expect(await listBookReviews(db, b1)).toHaveLength(1);
	});

	it('listBookReviews newest first; deleteReview; listUserReviews joins book', async () => {
		await saveReview(db, u1, b1, { rating: 5 }, 10);
		await saveReview(db, u2, b1, { rating: 3 }, 20);
		expect((await listBookReviews(db, b1)).map((r) => r.username)).toEqual(['b', 'a']);
		const mine = await listUserReviews(db, u1);
		expect(mine[0].book.title).toBe('One');
		await deleteReview(db, u1, b1);
		expect(await listUserReviews(db, u1)).toHaveLength(0);
	});
});
