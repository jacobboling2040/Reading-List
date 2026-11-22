import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

export type Db = LibSQLDatabase<typeof schema>;

let db: Db | undefined;

/**
 * Lazy singleton; defaults to a local file only outside Vercel, where a missing
 * TURSO_DATABASE_URL is a configuration error rather than a reason to use a throwaway file.
 */
export function getDb(): Db {
	if (!db) {
		const configured = process.env.TURSO_DATABASE_URL;
		if (!configured && process.env.VERCEL) {
			throw new Error(
				'TURSO_DATABASE_URL is not set. Configure it in the Vercel project settings.'
			);
		}
		const url = configured || 'file:local.db';
		const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
		// Foreign keys are a per-connection pragma on a local file. Over HTTP (remote Turso)
		// it has no effect, and the domain code never relies on cascades anyway.
		if (url.startsWith('file:')) {
			client.execute('PRAGMA foreign_keys = ON').catch((err) => {
				console.error('Could not enable foreign keys', err);
			});
		}
		db = drizzle(client, { schema });
	}
	return db;
}
