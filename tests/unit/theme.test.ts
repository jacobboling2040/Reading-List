import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMES, THEME_MODES, nextMode, parseThemePrefs } from '../../src/lib/theme';

describe('parseThemePrefs', () => {
	it('accepts valid values', () => {
		expect(parseThemePrefs('dark', 'plum')).toEqual({ mode: 'dark', scheme: 'plum' });
	});

	it('rejects unknown or missing values', () => {
		const defaults = { mode: 'system', scheme: 'paper' };
		expect(parseThemePrefs('<script>', 'x" onload="y')).toEqual(defaults);
		expect(parseThemePrefs(undefined, undefined)).toEqual(defaults);
	});
});

describe('nextMode', () => {
	it('cycles system, light, dark', () => {
		expect(nextMode('system')).toBe('light');
		expect(nextMode('light')).toBe('dark');
		expect(nextMode('dark')).toBe('system');
	});
});

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** Token maps keyed by `scheme:mode` (the system-mode dark values live in a media query). */
function readTokens(): Map<string, Record<string, string>> {
	const css = readFileSync('src/app.css', 'utf8');
	const tokens = new Map<string, Record<string, string>>();
	for (const m of css.matchAll(/:root\[data-scheme='(\w+)'\](\[data-theme='(\w+)'\])?\s*\{([^}]*)\}/g)) {
		const values: Record<string, string> = {};
		for (const d of m[4].matchAll(/(--[\w-]+):\s*([^;]+);/g)) values[d[1]] = d[2].trim();
		tokens.set(`${m[1]}:${m[3] ?? 'light'}`, values);
	}
	return tokens;
}

describe('colour tokens', () => {
	const tokens = readTokens();
	const pairs = [
		['--color-ink', '--color-bg'],
		['--color-ink', '--color-surface'],
		['--color-accent-ink', '--color-accent']
	];

	for (const scheme of SCHEMES) {
		for (const mode of THEME_MODES) {
			it(`${scheme} ${mode} keeps AA contrast`, () => {
				// System mode is light by default, with the dark values under a media query.
				const effective = mode === 'dark' ? 'dark' : 'light';
				const values = tokens.get(`${scheme}:${effective}`)!;
				expect(values).toBeDefined();
				for (const [fg, bg] of pairs) {
					expect(contrast(values[fg], values[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
				}
			});
		}

		it(`${scheme} system-mode dark values match the explicit dark values`, () => {
			expect(tokens.get(`${scheme}:system`)).toEqual(tokens.get(`${scheme}:dark`));
		});
	}
});
