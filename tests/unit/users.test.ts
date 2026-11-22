import { describe, it, expect, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb } from '../../src/lib/server/db/test-db';
import type { Db } from '../../src/lib/server/db/client';
import {
	books,
	dismissals,
	follows,
	invites,
	passwordResets,
	reviews,
	sessions,
	shelfEntries,
	users
} from '../../src/lib/server/db/schema';
import { UserError } from '../../src/lib/server/errors';
import { createSession, validateSession } from '../../src/lib/server/auth/session';
import {
	authenticate,
	createInvite,
	createPasswordReset,
	changePassword,
	createUser,
	deleteAccount,
	getInvite,
	isResetTokenValid,
	listAllPendingInvites,
	listInvites,
	redeemInvite,
	resetPassword,
	revokeInvite,
	setDeactivated,
	updateDisplayName,
	validateSignup
} from '../../src/lib/server/users';

const DAY = 24 * 60 * 60 * 1000;
const signup = (username: string) => ({
	username,
	displayName: username.toUpperCase(),
	password: 'correct horse battery'
});

let db: Db;
let adminId: number;
beforeEach(async () => {
	db = await createTestDb();
	adminId = await createUser(db, { ...signup('admin'), isAdmin: true });
});

describe('validateSignup', () => {
	it('returns copy for bad input and null for good', () => {
		expect(validateSignup({ ...signup('ab') })).toBe(
			'Username must be 3–20 characters: lowercase letters, numbers, or _.'
		);
		expect(validateSignup({ ...signup('Sam') })).toContain('Username must be');
		expect(validateSignup({ ...signup('sam'), displayName: '' })).toBe(
			'Display name must be 1–40 characters.'
		);
		expect(validateSignup({ ...signup('sam'), password: 'short' })).toBe(
			'Password must be at least 10 characters.'
		);
		expect(validateSignup(signup('sam_1'))).toBeNull();
	});
});

describe('invites', () => {
	it('redeemInvite creates user with invitedBy set', async () => {
		const token = await createInvite(db, adminId);
		expect(await getInvite(db, token)).toEqual({ valid: true });
		const id = await redeemInvite(db, token, signup('sam'));
		const [u] = await db.select().from(users).where(eq(users.id, id));
		expect(u.invitedBy).toBe(adminId);
		expect(u.isAdmin).toBe(false);
		const [inv] = await db.select().from(invites).where(eq(invites.token, token));
		expect(inv.usedBy).toBe(id);
		expect(await getInvite(db, token)).toEqual({ valid: false });
	});

	it('second redeem of same token throws expired/used message', async () => {
		const token = await createInvite(db, adminId);
		await redeemInvite(db, token, signup('sam'));
		await expect(redeemInvite(db, token, signup('pat'))).rejects.toThrow(
			'This invite link has expired or was already used.'
		);
	});

	it('Promise.all of two redeems creates exactly one user', async () => {
		const token = await createInvite(db, adminId);
		const results = await Promise.allSettled([
			redeemInvite(db, token, signup('sam')),
			redeemInvite(db, token, signup('pat'))
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
		expect(lost.reason).toBeInstanceOf(UserError);
		expect(lost.reason.message).toBe('This invite link has expired or was already used.');
		expect(await db.select().from(users)).toHaveLength(2); // admin + one
	});

	it('expired invite (8 days) rejected', async () => {
		const token = await createInvite(db, adminId, Date.now() - 8 * DAY);
		expect(await getInvite(db, token)).toEqual({ valid: false });
		await expect(redeemInvite(db, token, signup('sam'))).rejects.toBeInstanceOf(UserError);
	});

	it('revoked invite rejected; only creator or admin may revoke', async () => {
		const sam = await createUser(db, signup('sam'));
		const pat = await createUser(db, signup('pat'));
		const token = await createInvite(db, sam);
		await expect(revokeInvite(db, token, pat)).rejects.toBeInstanceOf(UserError);
		expect(await listInvites(db, sam)).toHaveLength(1);
		await revokeInvite(db, token, adminId);
		expect(await listInvites(db, sam)).toHaveLength(0);
		await expect(redeemInvite(db, token, signup('lee'))).rejects.toThrow(
			'expired or was already used'
		);
		const t2 = await createInvite(db, sam);
		await revokeInvite(db, t2, sam);
		expect(await getInvite(db, t2)).toEqual({ valid: false });
	});

	it('"Sam" rejected when "sam" exists, and the invite stays unused', async () => {
		await createUser(db, signup('sam'));
		const token = await createInvite(db, adminId);
		await expect(redeemInvite(db, token, { ...signup('sam'), username: 'Sam' })).rejects.toThrow(
			'That username is taken.'
		);
		expect(await getInvite(db, token)).toEqual({ valid: true });
		const [inv] = await db.select().from(invites).where(eq(invites.token, token));
		expect(inv.usedAt).toBeNull();
		await expect(createUser(db, { ...signup('sam'), username: 'SAM' })).rejects.toThrow(
			'That username is taken.'
		);
	});

	it('listInvites returns only pending invites', async () => {
		await createInvite(db, adminId);
		await createInvite(db, adminId, Date.now() - 8 * DAY);
		const used = await createInvite(db, adminId);
		await redeemInvite(db, used, signup('sam'));
		expect(await listInvites(db, adminId)).toHaveLength(1);
	});
});

describe('invite from deactivated creator', () => {
	it('cannot be redeemed', async () => {
		const sam = await createUser(db, signup('sam'));
		const token = await createInvite(db, sam);
		await setDeactivated(db, sam, true);
		await expect(redeemInvite(db, token, signup('pat'))).rejects.toThrow(
			'This invite link has expired or was already used.'
		);
	});
});

describe('invites from a deactivated creator are hidden everywhere', () => {
	it('getInvite, listInvites and listAllPendingInvites ignore them; reactivating restores', async () => {
		const sam = await createUser(db, signup('sam'));
		const token = await createInvite(db, sam);
		expect(await getInvite(db, token)).toEqual({ valid: true });
		expect(await listInvites(db, sam)).toHaveLength(1);
		expect((await listAllPendingInvites(db)).map((i) => i.token)).toContain(token);

		await setDeactivated(db, sam, true);
		expect(await getInvite(db, token)).toEqual({ valid: false });
		expect(await listInvites(db, sam)).toHaveLength(0);
		expect((await listAllPendingInvites(db)).map((i) => i.token)).not.toContain(token);

		await setDeactivated(db, sam, false);
		expect(await getInvite(db, token)).toEqual({ valid: true });
	});
});

describe('isResetTokenValid', () => {
	it('is true for a fresh token, false for unknown, expired and used ones', async () => {
		const sam = await createUser(db, signup('sam'));
		const now = Date.now();
		const token = await createPasswordReset(db, sam, now);
		expect(await isResetTokenValid(db, token, now)).toBe(true);
		expect(await isResetTokenValid(db, 'nope', now)).toBe(false);
		expect(await isResetTokenValid(db, token, now + 2 * DAY)).toBe(false);
		await resetPassword(db, token, 'a-brand-new-password', now);
		expect(await isResetTokenValid(db, token, now)).toBe(false);
	});
});

describe('deleting the last admin', () => {
	it('is refused, but allowed once another active admin exists', async () => {
		await expect(deleteAccount(db, adminId)).rejects.toThrow(
			"You're the only admin, so this account can't be deleted."
		);
		expect(await db.select().from(users).where(eq(users.id, adminId))).toHaveLength(1);
		const second = await createUser(db, { ...signup('second'), isAdmin: true });
		await setDeactivated(db, second, true);
		await expect(deleteAccount(db, adminId)).rejects.toThrow(UserError);
		await setDeactivated(db, second, false);
		await deleteAccount(db, adminId);
		expect(await db.select().from(users).where(eq(users.id, adminId))).toHaveLength(0);
	});
});

describe('password length', () => {
	it('rejects passwords over 256 characters', async () => {
		const long = 'x'.repeat(257);
		expect(validateSignup({ ...signup('sam'), password: long })).toBe(
			'Password must be at most 256 characters.'
		);
		const id = await createUser(db, signup('sam'));
		const t = await createPasswordReset(db, id);
		await expect(resetPassword(db, t, long)).rejects.toThrow(
			'Password must be at most 256 characters.'
		);
	});
});

describe('authenticate', () => {
	it('is case-insensitive on username', async () => {
		await createUser(db, signup('sam'));
		const u = await authenticate(db, 'SaM', 'correct horse battery');
		expect(u?.username).toBe('sam');
		expect(await authenticate(db, 'sam', 'wrong password!!')).toBeNull();
		expect(await authenticate(db, 'nobody', 'correct horse battery')).toBeNull();
	});

	it('deactivated user cannot authenticate and sessions are gone', async () => {
		const id = await createUser(db, signup('sam'));
		const { token } = await createSession(db, id);
		await setDeactivated(db, id, true);
		expect(await authenticate(db, 'sam', 'correct horse battery')).toBeNull();
		expect(await db.select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(0);
		expect(await validateSession(db, token)).toBeNull();
		await setDeactivated(db, id, false);
		expect(await authenticate(db, 'sam', 'correct horse battery')).not.toBeNull();
	});
});

describe('password reset', () => {
	it('works once, then fails; old sessions invalidated', async () => {
		const id = await createUser(db, signup('sam'));
		const { token: sess } = await createSession(db, id);
		const token = await createPasswordReset(db, id);
		await resetPassword(db, token, 'brand new password');
		expect(await validateSession(db, sess)).toBeNull();
		expect(await authenticate(db, 'sam', 'brand new password')).not.toBeNull();
		expect(await authenticate(db, 'sam', 'correct horse battery')).toBeNull();
		await expect(resetPassword(db, token, 'another password!')).rejects.toBeInstanceOf(UserError);
	});

	it('rejects expired tokens, unknown tokens and short passwords', async () => {
		const id = await createUser(db, signup('sam'));
		const old = await createPasswordReset(db, id, Date.now() - 25 * 60 * 60 * 1000);
		await expect(resetPassword(db, old, 'brand new password')).rejects.toBeInstanceOf(UserError);
		await expect(resetPassword(db, 'nope', 'brand new password')).rejects.toBeInstanceOf(UserError);
		const ok = await createPasswordReset(db, id);
		await expect(resetPassword(db, ok, 'short')).rejects.toThrow(
			'Password must be at least 10 characters.'
		);
	});
});

describe('deleteAccount', () => {
	it('removes reviews/shelves/follows/dismissals and unused invites; books remain', async () => {
		const id = await createUser(db, signup('sam'));
		const [book] = await db
			.insert(books)
			.values({ title: 'T', authors: '[]', createdBy: id })
			.returning();
		await db
			.insert(shelfEntries)
			.values({ userId: id, bookId: book.id, status: 'to_read', updatedAt: 1 });
		await db.insert(reviews).values({
			userId: id,
			bookId: book.id,
			rating: 5,
			createdAt: 1,
			updatedAt: 1
		});
		await db.insert(follows).values({ followerId: id, followeeId: adminId, createdAt: 1 });
		await db.insert(follows).values({ followerId: adminId, followeeId: id, createdAt: 1 });
		await db.insert(dismissals).values({ userId: id, bookId: book.id });
		await createInvite(db, id);
		const usedTok = await createInvite(db, id);
		await redeemInvite(db, usedTok, signup('pat'));

		await deleteAccount(db, id);

		expect(await db.select().from(users).where(eq(users.id, id))).toHaveLength(0);
		expect(await db.select().from(reviews)).toHaveLength(0);
		expect(await db.select().from(shelfEntries)).toHaveLength(0);
		expect(await db.select().from(follows)).toHaveLength(0);
		expect(await db.select().from(dismissals)).toHaveLength(0);
		expect(await db.select().from(invites).where(eq(invites.createdBy, id))).toHaveLength(0);
		expect(await db.select().from(books)).toHaveLength(1);
		const [pat] = await db.select().from(users).where(eq(users.username, 'pat'));
		expect(pat.invitedBy).toBeNull();
	});

	it('works with foreign keys OFF and leaves no orphans', async () => {
		await db.run(sql`PRAGMA foreign_keys = OFF`);
		const id = await createUser(db, signup('sam'));
		const [book] = await db
			.insert(books)
			.values({ title: 'T', authors: '[]', createdBy: id })
			.returning();
		await createSession(db, id);
		await createPasswordReset(db, id);
		await db
			.insert(shelfEntries)
			.values({ userId: id, bookId: book.id, status: 'reading', updatedAt: 1 });
		await db
			.insert(reviews)
			.values({ userId: id, bookId: book.id, rating: 4, createdAt: 1, updatedAt: 1 });
		await db.insert(follows).values({ followerId: id, followeeId: adminId, createdAt: 1 });
		await db.insert(follows).values({ followerId: adminId, followeeId: id, createdAt: 1 });
		await db.insert(dismissals).values({ userId: id, bookId: book.id });
		await createInvite(db, id); // unused
		await redeemInvite(db, await createInvite(db, id), signup('lee')); // used; lee.invitedBy = sam
		const adminTok = await createInvite(db, adminId);
		await redeemInvite(db, adminTok, signup('amy'));
		await db.update(invites).set({ usedBy: id }).where(eq(invites.token, adminTok));

		await deleteAccount(db, id);

		for (const t of [sessions, passwordResets, reviews, shelfEntries, follows, dismissals]) {
			expect(await db.select().from(t)).toHaveLength(0);
		}
		expect(await db.select().from(users).where(eq(users.id, id))).toHaveLength(0);
		expect(await db.select().from(invites).where(eq(invites.createdBy, id))).toHaveLength(0);
		expect(await db.select().from(invites).where(eq(invites.usedBy, id))).toHaveLength(0);
		expect(await db.select().from(users).where(eq(users.invitedBy, id))).toHaveLength(0);
		const [b] = await db.select().from(books);
		expect(b.createdBy).toBeNull();
	});
});

describe('updateDisplayName and changePassword', () => {
	let db: Db;
	beforeEach(async () => {
		db = await createTestDb();
	});
	const mk = () =>
		createUser(db, { username: 'sam', displayName: 'Sam', password: 'correct horse 1' });

	it('updateDisplayName trims and applies the 1-40 rule', async () => {
		const id = await mk();
		await updateDisplayName(db, id, '  Samantha ');
		const [u] = await db.select().from(users).where(eq(users.id, id));
		expect(u.displayName).toBe('Samantha');
		await expect(updateDisplayName(db, id, '   ')).rejects.toBeInstanceOf(UserError);
		await expect(updateDisplayName(db, id, 'x'.repeat(41))).rejects.toBeInstanceOf(UserError);
	});

	it('changePassword requires the current password and validates the new one', async () => {
		const id = await mk();
		await expect(
			changePassword(db, id, 'wrong password!', 'brand new password')
		).rejects.toBeInstanceOf(UserError);
		await expect(changePassword(db, id, 'correct horse 1', 'short')).rejects.toBeInstanceOf(
			UserError
		);
		await changePassword(db, id, 'correct horse 1', 'brand new password');
		expect(await authenticate(db, 'sam', 'brand new password')).not.toBeNull();
		expect(await authenticate(db, 'sam', 'correct horse 1')).toBeNull();
	});

	it('changePassword drops other sessions but keeps the current one', async () => {
		const id = await mk();
		const keep = await createSession(db, id);
		const other = await createSession(db, id);
		await changePassword(db, id, 'correct horse 1', 'brand new password', keep.token);
		expect(await validateSession(db, keep.token)).not.toBeNull();
		expect(await validateSession(db, other.token)).toBeNull();
	});
});
