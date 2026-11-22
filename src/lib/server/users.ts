import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { Db } from './db/client';
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
} from './db/schema';
import { UserError } from './errors';
import { hashPassword, verifyPassword } from './auth/password';
import { invalidateUserSessions, type SessionUser } from './auth/session';

const DAY = 24 * 60 * 60 * 1000;
const INVITE_LIFETIME = 7 * DAY;
const RESET_LIFETIME = DAY;

const INVALID_INVITE = 'This invite link has expired or was already used.';
const TAKEN = 'That username is taken.';
const PASSWORD_TOO_SHORT = 'Password must be at least 10 characters.';
const PASSWORD_TOO_LONG = 'Password must be at most 256 characters.';

function passwordProblem(pw: string): string | null {
	if (pw.length < 10) return PASSWORD_TOO_SHORT;
	if (pw.length > 256) return PASSWORD_TOO_LONG;
	return null;
}

export type Signup = {
	username: string;
	displayName: string;
	password: string;
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function validateSignup(input: Signup): string | null {
	if (!/^[a-z0-9_]{3,20}$/.test(input.username)) {
		return 'Username must be 3–20 characters: lowercase letters, numbers, or _.';
	}
	const name = input.displayName.trim();
	if (name.length < 1 || name.length > 40) return 'Display name must be 1–40 characters.';
	return passwordProblem(input.password);
}

// Works for both the Db and a transaction handle.
type Executor = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;

async function insertUser(
	db: Executor,
	input: Omit<Signup, 'password'> & {
		passwordHash: string;
		isAdmin?: boolean;
		invitedBy?: number | null;
	}
): Promise<number> {
	const username = input.username.toLowerCase();
	const [existing] = await db
		.select({ id: users.id })
		.from(users)
		.where(sql`lower(${users.username}) = ${username}`);
	if (existing) throw new UserError(TAKEN);
	try {
		const [row] = await db
			.insert(users)
			.values({
				username,
				displayName: input.displayName.trim(),
				passwordHash: input.passwordHash,
				isAdmin: input.isAdmin ?? false,
				invitedBy: input.invitedBy ?? null,
				createdAt: Date.now()
			})
			.returning({ id: users.id });
		return row.id;
	} catch (e) {
		if (String(e).includes('UNIQUE')) throw new UserError(TAKEN);
		throw e;
	}
}

export async function createUser(
	db: Db,
	input: Signup & { isAdmin?: boolean; invitedBy?: number }
): Promise<number> {
	const { password, ...rest } = input;
	return insertUser(db, { ...rest, passwordHash: await hashPassword(password) });
}

export async function createInvite(db: Db, createdBy: number, now = Date.now()): Promise<string> {
	const token = randomBytes(32).toString('base64url');
	await db.insert(invites).values({
		token,
		createdBy,
		createdAt: now,
		expiresAt: now + INVITE_LIFETIME
	});
	return token;
}

export async function listInvites(db: Db, createdBy: number, now = Date.now()) {
	return db
		.select()
		.from(invites)
		.where(
			and(
				eq(invites.createdBy, createdBy),
				isNull(invites.usedAt),
				isNull(invites.revokedAt),
				gt(invites.expiresAt, now)
			)
		)
		.orderBy(invites.createdAt);
}

/** Every pending invite from any member, with the creator's display name (admin view). */
export async function listAllPendingInvites(db: Db, now = Date.now()) {
	return db
		.select({
			token: invites.token,
			createdBy: invites.createdBy,
			createdByName: users.displayName,
			createdAt: invites.createdAt,
			expiresAt: invites.expiresAt
		})
		.from(invites)
		.innerJoin(users, eq(users.id, invites.createdBy))
		.where(and(isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now)))
		.orderBy(invites.createdAt);
}

export async function revokeInvite(db: Db, token: string, byUserId: number): Promise<void> {
	const [inv] = await db.select().from(invites).where(eq(invites.token, token));
	if (!inv) return;
	if (inv.createdBy !== byUserId) {
		const [by] = await db
			.select({ isAdmin: users.isAdmin })
			.from(users)
			.where(eq(users.id, byUserId));
		if (!by?.isAdmin) throw new UserError('You cannot revoke this invite.');
	}
	await db
		.update(invites)
		.set({ revokedAt: Date.now() })
		.where(and(eq(invites.token, token), isNull(invites.usedAt), isNull(invites.revokedAt)));
}

export async function getInvite(
	db: Db,
	token: string,
	now = Date.now()
): Promise<{ valid: boolean }> {
	const [row] = await db
		.select({ token: invites.token })
		.from(invites)
		.where(
			and(
				eq(invites.token, token),
				isNull(invites.usedAt),
				isNull(invites.revokedAt),
				gt(invites.expiresAt, now)
			)
		);
	return { valid: !!row };
}

export async function redeemInvite(
	db: Db,
	token: string,
	signup: Signup,
	now = Date.now()
): Promise<number> {
	signup = { ...signup, username: signup.username.trim().toLowerCase() };
	const problem = validateSignup(signup);
	if (problem) throw new UserError(problem);
	const passwordHash = await hashPassword(signup.password);
	try {
		return await db.transaction(async (tx) => {
			// Claim first so concurrent redeems serialize on the write lock; only one wins.
			// The creator must still be active.
			const claimed = await tx
				.update(invites)
				.set({ usedAt: now })
				.where(
					and(
						eq(invites.token, token),
						isNull(invites.usedAt),
						isNull(invites.revokedAt),
						gt(invites.expiresAt, now),
						sql`${invites.createdBy} IN (SELECT id FROM users WHERE deactivated_at IS NULL)`
					)
				);
			if (claimed.rowsAffected === 0) throw new UserError(INVALID_INVITE);
			const [inv] = await tx
				.select({ createdBy: invites.createdBy })
				.from(invites)
				.where(eq(invites.token, token));
			const id = await insertUser(tx, {
				username: signup.username,
				displayName: signup.displayName,
				passwordHash,
				invitedBy: inv.createdBy
			});
			await tx.update(invites).set({ usedBy: id }).where(eq(invites.token, token));
			return id;
		});
	} catch (e) {
		if (e instanceof UserError) throw e;
		// A losing concurrent redeem can surface as a busy/locked/conflict error.
		if (/busy|locked|conflict|transaction/i.test(String(e))) throw new UserError(INVALID_INVITE);
		throw e;
	}
}

let dummyHash: Promise<string> | undefined;

export async function authenticate(
	db: Db,
	username: string,
	password: string
): Promise<SessionUser | null> {
	const [row] = await db
		.select()
		.from(users)
		.where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
	const active = row && row.deactivatedAt === null;
	// Always verify against some hash so timing doesn't reveal which usernames exist.
	dummyHash ??= hashPassword('dummy-password-for-timing');
	const ok = await verifyPassword(active ? row.passwordHash : await dummyHash, password);
	if (!active || !ok) return null;
	return {
		id: row.id,
		username: row.username,
		displayName: row.displayName,
		isAdmin: row.isAdmin
	};
}

export async function createPasswordReset(
	db: Db,
	userId: number,
	now = Date.now()
): Promise<string> {
	const token = randomBytes(32).toString('base64url');
	await db.insert(passwordResets).values({
		tokenHash: sha256(token),
		userId,
		expiresAt: now + RESET_LIFETIME
	});
	return token;
}

export async function resetPassword(
	db: Db,
	token: string,
	newPassword: string,
	now = Date.now()
): Promise<void> {
	const problem = passwordProblem(newPassword);
	if (problem) throw new UserError(problem);
	const passwordHash = await hashPassword(newPassword);
	const tokenHash = sha256(token);
	const userId = await db.transaction(async (tx) => {
		const claimed = await tx
			.update(passwordResets)
			.set({ usedAt: now })
			.where(
				and(
					eq(passwordResets.tokenHash, tokenHash),
					isNull(passwordResets.usedAt),
					gt(passwordResets.expiresAt, now)
				)
			);
		if (claimed.rowsAffected === 0) {
			throw new UserError('This reset link has expired or was already used.');
		}
		const [row] = await tx
			.select({ userId: passwordResets.userId })
			.from(passwordResets)
			.where(eq(passwordResets.tokenHash, tokenHash));
		await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
		return row.userId;
	});
	await invalidateUserSessions(db, userId);
}

export async function setDeactivated(db: Db, userId: number, deactivated: boolean): Promise<void> {
	await db
		.update(users)
		.set({ deactivatedAt: deactivated ? Date.now() : null })
		.where(eq(users.id, userId));
	if (deactivated) await invalidateUserSessions(db, userId);
}

export async function deleteAccount(db: Db, userId: number): Promise<void> {
	// Explicit deletes: foreign-key cascades aren't guaranteed on every connection.
	await db.transaction(async (tx) => {
		await tx.delete(sessions).where(eq(sessions.userId, userId));
		await tx.delete(passwordResets).where(eq(passwordResets.userId, userId));
		await tx.delete(reviews).where(eq(reviews.userId, userId));
		await tx.delete(shelfEntries).where(eq(shelfEntries.userId, userId));
		await tx
			.delete(follows)
			.where(or(eq(follows.followerId, userId), eq(follows.followeeId, userId)));
		await tx.delete(dismissals).where(eq(dismissals.userId, userId));
		await tx.delete(invites).where(eq(invites.createdBy, userId));
		await tx.update(invites).set({ usedBy: null }).where(eq(invites.usedBy, userId));
		await tx.update(users).set({ invitedBy: null }).where(eq(users.invitedBy, userId));
		await tx.update(books).set({ createdBy: null }).where(eq(books.createdBy, userId));
		await tx.delete(users).where(eq(users.id, userId));
	});
}
