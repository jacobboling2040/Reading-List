import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe('getDb', () => {
	it('refuses to default to a local file on Vercel', async () => {
		vi.stubEnv('VERCEL', '1');
		vi.stubEnv('TURSO_DATABASE_URL', '');
		vi.resetModules();
		const { getDb } = await import('../../src/lib/server/db/client');
		expect(() => getDb()).toThrow(/TURSO_DATABASE_URL is not set/);
	});

	it('uses the configured URL, and works without Vercel', async () => {
		vi.stubEnv('VERCEL', '');
		vi.stubEnv('TURSO_DATABASE_URL', 'file::memory:');
		vi.resetModules();
		const { getDb } = await import('../../src/lib/server/db/client');
		expect(getDb()).toBe(getDb());
	});
});
