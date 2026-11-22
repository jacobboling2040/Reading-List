
import { describe, expect, it } from 'vitest';
import { POST } from '../../src/routes/(app)/settings/theme/+server';

function call(accept: string | null, fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const headers = new Headers();
	if (accept) headers.set('accept', accept);
	headers.set('referer', 'http://localhost/settings');
	const set: string[] = [];
	const event = {
		request: new Request('http://localhost/settings/theme', { method: 'POST', body, headers }),
		cookies: { set: (name: string) => void set.push(name) },
		locals: { theme: { mode: 'system', scheme: 'paper' } },
		url: new URL('http://localhost/settings/theme')
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const result = (POST as any)(event);
	return { result, set };
}

describe('POST /settings/theme', () => {
	it('validates and echoes for JSON requests without setting cookies', async () => {
		const { result, set } = call('application/json', { mode: 'dark', scheme: 'bogus' });
		const res = (await result) as Response;
		expect(await res.json()).toEqual({ mode: 'dark', scheme: 'paper' });
		expect(set).toEqual([]);
	});

	it('sets both cookies and redirects for plain form posts', async () => {
		const { result, set } = call(null, { mode: 'dark', scheme: 'sage' });
		await expect(result).rejects.toMatchObject({ status: 303, location: '/settings' });
		expect(set.sort()).toEqual(['scheme', 'theme']);
	});
});
