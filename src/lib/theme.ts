/** Theme preferences shared by the server (hook, endpoint) and the browser (settings picker). */

export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const SCHEMES = ['paper', 'sage', 'slate', 'plum'] as const;
export type Scheme = (typeof SCHEMES)[number];

export const SCHEME_LABELS: Record<Scheme, string> = {
	paper: 'Paper',
	sage: 'Sage',
	slate: 'Slate',
	plum: 'Plum'
};

export const THEME_COOKIE = 'theme';
export const SCHEME_COOKIE = 'scheme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemePrefs = { mode: ThemeMode; scheme: Scheme };

/** Cookie values are user-controlled, so only allow-listed values ever come out. */
export function parseThemePrefs(theme: string | undefined, scheme: string | undefined): ThemePrefs {
	return {
		mode: THEME_MODES.find((m) => m === theme) ?? 'system',
		scheme: SCHEMES.find((s) => s === scheme) ?? 'paper'
	};
}

export function nextMode(mode: ThemeMode): ThemeMode {
	return THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
}

/** Browser only: switch the page now and remember the choice for the server to render next time. */
export function applyThemePrefs(prefs: ThemePrefs): void {
	const root = document.documentElement;
	root.dataset.theme = prefs.mode;
	root.dataset.scheme = prefs.scheme;
	const attrs = `; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
	document.cookie = `${THEME_COOKIE}=${prefs.mode}${attrs}`;
	document.cookie = `${SCHEME_COOKIE}=${prefs.scheme}${attrs}`;
}
