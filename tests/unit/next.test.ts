import { describe, it, expect } from 'vitest';
import { safeNext } from '../../src/lib/server/auth/next';

describe('safeNext', () => {
	it('keeps same-origin paths', () => {
		expect(safeNext('/people')).toBe('/people');
		expect(safeNext('/search?q=a%20b#x')).toBe('/search?q=a%20b#x');
	});
	it.each([
		null,
		undefined,
		'',
		'people',
		'https://evil.example',
		'//evil.example',
		'/\\evil.example',
		'/.//evil.example',
		'/a/..//evil.example',
		'/..//evil.example',
		'/%2e%2e//evil.example',
		'/\t/evil.example',
		'/\n/evil.example',
		'/\r/evil.example',
		'/\x00/evil.example',
		'/\x7f/evil.example'
	])('falls back to / for %j', (bad) => {
		expect(safeNext(bad)).toBe('/');
	});
});
