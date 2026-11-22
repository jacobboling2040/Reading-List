import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from '../../src/lib/server/db/schema';
import { E2E_PORT, OL_STUB_PORT } from './ports';
import { startOpenLibraryStub } from './openlibrary-stub';
import { createAdmin, E2E_DB_FILE, E2E_DB_URL } from './seed';

async function waitFor(url: string, ms = 60_000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		try {
			await fetch(url);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 300));
		}
	}
	throw new Error(`dev server did not start at ${url}`);
}

export default async function globalSetup() {
	for (const suffix of ['', '-shm', '-wal', '-journal']) {
		rmSync(`${E2E_DB_FILE}${suffix}`, { force: true });
	}
	const client = createClient({ url: E2E_DB_URL });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: './drizzle' });
	await createAdmin(db);
	client.close();

	const stub = await startOpenLibraryStub(OL_STUB_PORT);
	// Started here (not via webServer) so the database is migrated and seeded before the app opens it.
	const dev = spawn('npx', ['vite', 'dev', '--port', String(E2E_PORT), '--strictPort'], {
		stdio: ['ignore', 'ignore', 'pipe'],
		detached: true,
		env: {
			...process.env,
			TURSO_DATABASE_URL: E2E_DB_URL,
			OPENLIBRARY_BASE_URL: `http://localhost:${OL_STUB_PORT}`
		}
	});
	let devStderr = '';
	dev.stderr?.on('data', (chunk) => (devStderr += chunk));
	const exited = new Promise<never>((_, reject) => {
		dev.once('error', reject);
		dev.once('exit', (code, signal) =>
			reject(new Error(`dev server exited before it was ready (code ${code}, signal ${signal})`))
		);
	});
	const stop = () => {
		try {
			if (dev.pid) process.kill(-dev.pid);
		} catch {
			// already gone
		}
		stub.close();
	};
	try {
		await Promise.race([waitFor(`http://localhost:${E2E_PORT}/robots.txt`), exited]);
	} catch (e) {
		stop();
		if (devStderr) console.error(devStderr);
		throw e;
	}
	dev.removeAllListeners('exit');
	return async () => stop();
}
