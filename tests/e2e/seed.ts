import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../../src/lib/server/db/schema';
import type { Db } from '../../src/lib/server/db/client';
import { createInvite, createUser } from '../../src/lib/server/users';

import { E2E_PORT } from './ports';

export const E2E_DB_FILE = E2E_PORT === 5174 ? 'test-e2e.db' : `test-e2e-${E2E_PORT}.db`;
export const E2E_DB_URL = `file:${E2E_DB_FILE}`;
export const ADMIN = {
	username: 'admin',
	displayName: 'Admin',
	password: 'admin-password-123'
};

/** A standalone handle on the e2e database (the dev server uses its own connection). */
export function openE2eDb(): Db {
	return drizzle(createClient({ url: E2E_DB_URL }), { schema });
}

export async function createAdmin(db: Db, input = ADMIN): Promise<number> {
	return createUser(db, { ...input, isAdmin: true });
}

export async function createInviteToken(db: Db, createdBy: number): Promise<string> {
	return createInvite(db, createdBy);
}

/** Run `fn` with a short-lived handle on the e2e database, closing it afterwards. */
export async function withE2eDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
	const db = openE2eDb();
	try {
		return await fn(db);
	} finally {
		db.$client.close();
	}
}

/** Look up the seeded admin's id. */
export async function adminId(db: Db): Promise<number> {
	const row = await db.query.users.findFirst({
		where: (u, { eq }) => eq(u.username, ADMIN.username)
	});
	if (!row) throw new Error('admin not seeded');
	return row.id;
}
