import type { Handle } from '@sveltejs/kit/hooks';
import { getDb } from './lib/server/db/client';
import { handleAuth } from './lib/server/auth/hook';
import { SCHEME_COOKIE, THEME_COOKIE, parseThemePrefs } from './lib/theme';

export const handle: Handle = ({ event, resolve }) => {
	// Only parsed, allow-listed values reach the HTML.
	const prefs = parseThemePrefs(event.cookies.get(THEME_COOKIE), event.cookies.get(SCHEME_COOKIE));
	event.locals.theme = prefs;
	return handleAuth(getDb(), event, (e) =>
		resolve(e, {
			transformPageChunk: ({ html }) =>
				html.replace('%theme%', prefs.mode).replace('%scheme%', prefs.scheme)
		})
	);
};
