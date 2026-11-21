import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../src/lib/server/db/test-db';
import * as s from '../../src/lib/server/db/schema';

async function setup() {
	const db = await createTestDb();
	const mk = async (username: string, invitedBy?: number) =>
		(
			await db
				.insert(s.users)
				.values({ username, displayName: username, passwordHash: 'x', invitedBy, createdAt: 1 })
				.returning()
		)[0];
	const [book] = await db.insert(s.books).values({ title: 'T', authors: '[]' }).returning();
	return { db, mk, book };
}

describe('schema', () => {
	it('rejects a second shelf entry for the same user and book', async () => {
		const { db, mk, book } = await setup();
		const u = await mk('a');
		const row = { userId: u.id, bookId: book.id, status: 'to_read', updatedAt: 1 };
		await db.insert(s.shelfEntries).values(row);
		await expect(db.insert(s.shelfEntries).values(row)).rejects.toThrow();
	});

	it('rejects rating 0 and 6', async () => {
		const { db, mk, book } = await setup();
		const u = await mk('a');
		for (const rating of [0, 6]) {
			await expect(
				db
					.insert(s.reviews)
					.values({ userId: u.id, bookId: book.id, rating, createdAt: 1, updatedAt: 1 })
			).rejects.toThrow();
		}
	});

	it('rejects self-follow', async () => {
		const { db, mk } = await setup();
		const u = await mk('a');
		await expect(
			db.insert(s.follows).values({ followerId: u.id, followeeId: u.id, createdAt: 1 })
		).rejects.toThrow();
	});

	it('rejects usernames differing only by case', async () => {
		const { mk } = await setup();
		await mk('alice');
		await expect(mk('Alice')).rejects.toThrow();
	});

	it('deleting a user cascades to shelf entries, reviews, follows and nulls invitedBy', async () => {
		const { db, mk, book } = await setup();
		const a = await mk('a');
		const b = await mk('b', a.id);
		await db.insert(s.shelfEntries).values({ userId: a.id, bookId: book.id, status: 'reading', updatedAt: 1 });
		await db.insert(s.reviews).values({ userId: a.id, bookId: book.id, rating: 5, createdAt: 1, updatedAt: 1 });
		await db.insert(s.follows).values({ followerId: a.id, followeeId: b.id, createdAt: 1 });
		await db.delete(s.users).where(eq(s.users.id, a.id));
		expect(await db.select().from(s.shelfEntries)).toHaveLength(0);
		expect(await db.select().from(s.reviews)).toHaveLength(0);
		expect(await db.select().from(s.follows)).toHaveLength(0);
		const [after] = await db.select().from(s.users).where(eq(s.users.id, b.id));
		expect(after.invitedBy).toBeNull();
	});
});
