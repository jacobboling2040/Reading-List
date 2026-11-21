import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

export type Db = LibSQLDatabase<typeof schema>;

let db: Db | undefined;

/** Lazy singleton; defaults to a local file when TURSO_DATABASE_URL is unset. */
export function getDb(): Db {
	if (!db) {
		const client = createClient({
			url: process.env.TURSO_DATABASE_URL || 'file:local.db',
			authToken: process.env.TURSO_AUTH_TOKEN
		});
		void client.execute('PRAGMA foreign_keys = ON');
		db = drizzle(client, { schema });
	}
	return db;
}
