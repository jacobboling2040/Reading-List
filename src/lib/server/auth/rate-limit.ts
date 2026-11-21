import { and, eq, gt, lt, count } from 'drizzle-orm';
import type { Db } from '../db/client';
import { loginAttempts } from '../db/schema';

const WINDOW_MS = 15 * 60_000;
const MAX_PER_USERNAME = 5;
const MAX_PER_IP = 20;

/** False when the username (5) or IP (20) already has too many failed attempts in the last 15 minutes. */
export async function checkLoginAllowed(
	db: Db,
	username: string,
	ip: string,
	now = Date.now()
): Promise<boolean> {
	const since = now - WINDOW_MS;
	const [byUser] = await db
		.select({ n: count() })
		.from(loginAttempts)
		.where(and(eq(loginAttempts.username, username.toLowerCase()), gt(loginAttempts.at, since)));
	if (byUser.n >= MAX_PER_USERNAME) return false;
	const [byIp] = await db
		.select({ n: count() })
		.from(loginAttempts)
		.where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.at, since)));
	return byIp.n < MAX_PER_IP;
}

export async function recordFailedLogin(
	db: Db,
	username: string,
	ip: string,
	now = Date.now()
): Promise<void> {
	await db.delete(loginAttempts).where(lt(loginAttempts.at, now - WINDOW_MS));
	await db.insert(loginAttempts).values({ username: username.toLowerCase(), ip, at: now });
}
